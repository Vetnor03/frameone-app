import {
  BUILT_IN_LAYOUT_KEYS as builtIns, CUSTOM_LAYOUT_NAME_MAX as maxName,
  SUPPORTED_PHYSICAL_GEOMETRIES as geometries, normalizeLayoutName as normalize,
  nextCustomLayoutName as nextName,
  orderedLayoutItems as ordered, validateCustomGeometry as validate,
  geometryWithAssignments as assigned, customPhysicalPayload as payload,
  duplicateLayout as duplicate, duplicateLayoutClientState as duplicateClientState, remapAssignmentsAfterGeometryEdit as remap,
} from './customLayouts.mjs'

export type CustomLayoutCell = { slot: number; col: number; row: number; colSpan: number; rowSpan: number }
export type CustomLayout = { id: string; deviceId: string; ownerUserId: string; name: string; cells: CustomLayoutCell[]; sortOrder: number; createdAt: string; updatedAt: string }
export const BUILT_IN_LAYOUT_KEYS = builtIns as readonly ['default','pyramid','square','full']
export const CUSTOM_LAYOUT_NAME_MAX = maxName as number
export const SUPPORTED_PHYSICAL_GEOMETRIES = geometries as Set<string>
export const normalizeLayoutName = normalize as (value:unknown)=>string
export const nextCustomLayoutName = nextName as (layouts:Array<{name?:unknown}>)=>string
export const orderedLayoutItems = ordered as (layouts:CustomLayout[])=>Array<{type:'built-in'|'custom'|'add';key:string;id:string;layout?:CustomLayout}>
export const validateCustomGeometry = validate as (cells:unknown, options?:{requirePhysical?:boolean;requireModules?:boolean})=>{valid:boolean;errors:string[];unsupportedSlots:number[]}
export const geometryWithAssignments = assigned as (cells:CustomLayoutCell[], assignments:Record<number,string|null>)=>Array<CustomLayoutCell&{module:string}>
export const customPhysicalPayload = payload as (layout:CustomLayout,assignments:Record<number,string|null>)=>{layout:'custom';custom_layout_id:string;cells:Array<CustomLayoutCell&{module:string}>}|null
export const remapAssignmentsAfterGeometryEdit = remap as (previousCells:CustomLayoutCell[],nextCells:CustomLayoutCell[],assignments:Record<number,string|null>)=>Record<number,string|null>
export const duplicateLayout = duplicate as (layout:CustomLayout,id:string,now?:string)=>CustomLayout
export const duplicateLayoutClientState = duplicateClientState as <T extends Record<PropertyKey,unknown>>(layouts:CustomLayout[],assignments:Record<string,T>,sourceId:string,duplicate:CustomLayout)=>{layouts:CustomLayout[];assignments:Record<string,T>;carouselItemId:string;activeCustomLayoutId:string}
