import type {ResponsiveCellProfile} from './responsiveCellProfile.mjs'
export type AiFollowUpdate={id:string;watchId:string;topicTitle:string;summary:string;createdAt:string;isRead:boolean}
export type AiFollowState={followingCount:number;updates:readonly AiFollowUpdate[]}
export type AiFollowRect={x:number;y:number;width:number;height:number}
export type AiFollowComposition={family:'quiet'|'micro'|'shallow'|'single'|'list'|'expanded';mode:'zero-follow'|'no-change'|'updates';updates:AiFollowUpdate[];summaryLines:number}
export type AiFollowUpdateGroup={update:AiFollowUpdate;groupRect:AiFollowRect;topicRect:AiFollowRect;summaryRect:AiFollowRect}
export type AiFollowLayout={headerRect:AiFollowRect;quietPrimaryRect:AiFollowRect|null;quietSecondaryRect:AiFollowRect|null;updatesRect:AiFollowRect|null;updateGroups:AiFollowUpdateGroup[];overflowRect:AiFollowRect|null;overflow?:number}
export const aiFollowStudioPresets:Record<'normal'|'long'|'extreme'|'empty',AiFollowState>
export function selectCurrentAiFollowUpdates(state:AiFollowState):AiFollowUpdate[]
export function fitAiFollowTitle(value:string,width:number,measure:(value:string,fontSize:number)=>number,options?:{fontSize?:number;ellipsis?:string}):{text:string;truncated:boolean}
export function wrapAiFollowSummary(value:string,width:number,maxLines:number,measure:(value:string,fontSize:number)=>number,options?:{fontSize?:number;ellipsis?:string}):{lines:string[];truncated:boolean}
export function aiFollowComposition(profile:ResponsiveCellProfile,state:AiFollowState):AiFollowComposition
export function aiFollowLayout(profile:ResponsiveCellProfile,composition:AiFollowComposition):AiFollowLayout
