import type { ComponentProps } from 'react'
import { Button as NativeButton, Input as NativeInput } from '@tarojs/components'

// Taro rewrites bare HTML tag selectors to .h5-*; native controls use explicit classes.
export function Button({className='',...props}:ComponentProps<typeof NativeButton>){
 return <NativeButton {...props} className={'mini-button '+className}/>
}
export function Input({className='',...props}:ComponentProps<typeof NativeInput>){
 return <NativeInput {...props} className={'mini-input '+className}/>
}
