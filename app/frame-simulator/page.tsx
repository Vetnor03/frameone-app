import type { Metadata } from 'next'
import FrameSimulator from './FrameSimulator'
export const metadata: Metadata = { title:'Frame simulator', robots:{index:false,follow:false} }
export default function Page(){ return <FrameSimulator/> }
