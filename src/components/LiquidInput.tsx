import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { LiquidSurface } from './LiquidSurface'

/** 입력 DOM은 그대로 두고 뒤쪽에만 렌즈를 둔다. 다른 테마에서는 wrapper가 배치를 만들지 않는다. */
export function LiquidInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <span className="liquid-input"><LiquidSurface /><input {...props} /></span>
}

export function LiquidTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <span className="liquid-input"><LiquidSurface /><textarea {...props} /></span>
}
