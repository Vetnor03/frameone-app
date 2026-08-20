export type ModuleResponsivePolicy={
  module:string;contentNature:readonly ('text'|'metrics'|'visual'|'list'|'mixed')[]
  variability:'low'|'bounded'|'high';sourceType:readonly ('user-input'|'connected-service'|'automated'|'fixed-system')[]
  textCompression:'never'|'deterministic-only'|'ai-eligible-later';priorities:readonly string[];optionalContent:readonly string[];composition:string
}
export const moduleResponsivePolicies:Readonly<Record<string,ModuleResponsivePolicy>>
export function moduleResponsivePolicy(module:string):ModuleResponsivePolicy
