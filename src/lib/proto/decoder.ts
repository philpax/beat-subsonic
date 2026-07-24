/**
 * A minimal protobuf wire-format reader.
 *
 * Supports:
 *  - Varint (wire type 0)
 *  - Fixed64 (wire type 1)
 *  - Length-delimited / bytes (wire type 2)
 *  - Fixed32 (wire type 5, also used for float fields)
 *  - Skipping unknown fields (wire types 3, 4 deprecated groups)
 *
 * No codegen needed — the schema is small and fixed.
 */

export class ProtoReader {
  private view: DataView
  private uint8: Uint8Array
  pos: number
  readonly end: number

  constructor(bytes: Uint8Array, offset = 0, length?: number) {
    this.uint8 = bytes
    this.pos = offset
    this.end = offset + (length ?? bytes.length - offset)
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  }

  /**
   * Read a varint (base-128, LEB128).
   * NOTE: This truncates to 32 bits via `>>> 0`. Only use for uint32 fields.
   * For uint64 fields (e.g. the tags bitfield), use readVarint64() instead.
   */
  readVarint(): number {
    let result = 0
    let shift = 0
    let byte: number
    do {
      byte = this.uint8[this.pos++]
      result |= (byte & 0x7f) << shift
      shift += 7
    } while (byte & 0x80 && shift < 35)
    // For values that overflow 32 bits, we may lose precision here.
    // In practice, most fields are uint32. The tags bitfield (uint64)
    // is read via readVarint64 below for safety.
    return result >>> 0
  }

  /**
   * Read a 64-bit varint as a JS number (may lose precision above 2^53).
   * Used for the tags bitfield. In practice the bitfield uses <53 bits.
   */
  readVarint64(): number {
    let result = 0
    let shift = 0
    let byte: number
    do {
      byte = this.uint8[this.pos++]
      if (shift < 32) {
        result |= (byte & 0x7f) << shift
      } else {
        // Upper bits: shift beyond 32
        result += (byte & 0x7f) * Math.pow(2, shift)
      }
      shift += 7
    } while (byte & 0x80 && shift < 70)
    return result
  }

  /** Read a 32-bit fixed value (wire type 5). */
  readFixed32(): number {
    const val = this.view.getUint32(this.pos, true)
    this.pos += 4
    return val
  }

  /** Read a 64-bit fixed value as two 32-bit halves (wire type 1). */
  readFixed64(): number {
    const lo = this.view.getUint32(this.pos, true)
    const hi = this.view.getUint32(this.pos + 4, true)
    this.pos += 8
    return hi * 0x100000000 + lo
  }

  /** Read a float (wire type 5, IEEE 754). */
  readFloat(): number {
    const val = this.view.getFloat32(this.pos, true)
    this.pos += 4
    return val
  }

  /** Read a length-delimited bytes field (wire type 2). */
  readBytes(): Uint8Array {
    const len = this.readVarint()
    const slice = this.uint8.subarray(this.pos, this.pos + len)
    this.pos += len
    return slice
  }

  /** Read a length-delimited string (wire type 2). */
  readString(): string {
    const bytes = this.readBytes()
    return new TextDecoder().decode(bytes)
  }

  /** Read a tag: (field_number << 3) | wire_type. Returns [fieldNumber, wireType]. */
  readTag(): [number, number] | null {
    if (this.pos >= this.end) return null
    const tag = this.readVarint()
    const fieldNumber = tag >>> 3
    const wireType = tag & 0x07
    if (fieldNumber === 0) return null
    return [fieldNumber, wireType]
  }

  /** Skip a field of the given wire type. */
  skipField(wireType: number): void {
    switch (wireType) {
      case 0: // varint
        this.readVarint64()
        break
      case 1: // fixed64
        this.pos += 8
        break
      case 2: {
        // length-delimited
        const len = this.readVarint()
        this.pos += len
        break
      }
      case 5: // fixed32
        this.pos += 4
        break
      case 3: {
        // start group (deprecated)
        // Skip until end group
        let tag: [number, number] | null
        while ((tag = this.readTag())) {
          const [, wt] = tag
          if (wt === 4) break
          this.skipField(wt)
        }
        break
      }
      case 4: // end group (deprecated)
        break
      default:
        throw new Error(`Unknown wire type: ${wireType}`)
    }
  }

  /** Check if there are more bytes to read. */
  hasNext(): boolean {
    return this.pos < this.end
  }
}

/** Wire type constants. */
export const WireType = {
  Varint: 0,
  Fixed64: 1,
  LengthDelimited: 2,
  StartGroup: 3,
  EndGroup: 4,
  Fixed32: 5,
} as const

/**
 * Generic message decoder. Walks tags and dispatches to field handlers.
 *
 * @param bytes - The message bytes
 * @param handler - Called with (fieldNumber, wireType, reader)
 *
 * The handler is responsible for reading (or skipping) the field value.
 */
export function decodeMessage(
  bytes: Uint8Array,
  handler: (fieldNumber: number, wireType: number, reader: ProtoReader) => void,
  offset = 0,
  length?: number,
): void {
  const reader = new ProtoReader(bytes, offset, length)
  let tag: [number, number] | null
  while ((tag = reader.readTag())) {
    const [fieldNumber, wireType] = tag
    handler(fieldNumber, wireType, reader)
  }
}

/**
 * Decode a length-delimited field that contains packed repeated varints.
 * Used for packed repeated uint32 fields.
 */
export function decodePackedVarints(bytes: Uint8Array): number[] {
  const reader = new ProtoReader(bytes)
  const values: number[] = []
  while (reader.hasNext()) {
    values.push(reader.readVarint())
  }
  return values
}
