import * as React from 'react'
import { cn } from '@/lib/utils'

interface SliderProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

const Slider = React.forwardRef<HTMLInputElement, SliderProps>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    type="range"
    className={cn(
      'h-4 w-full cursor-pointer appearance-none rounded-lg bg-secondary accent-primary',
      className,
    )}
    {...props}
  />
))
Slider.displayName = 'Slider'

export { Slider }
