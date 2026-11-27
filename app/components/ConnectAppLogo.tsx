import type { ConnectAppKey } from '@/app/lib/integrations/catalog'

type LogoPath = { d: string; fill?: string; transform?: string }
type LogoMark = {
  background: string
  viewBox: string
  color?: string
  paths?: LogoPath[]
  wordmark?: string
  fontSize?: number
  fontFamily?: string
}

/**
 * Local, flat brand identifiers, with the same rounded-square presentation.
 * Outlook: Simple Icons 11.15.0. Google Calendar / Microsoft To Do: dashboard-icons.
 * Existing Spond and Google Tasks vector marks: Simple Icons.
 * The other pictorial marks are simplified from published app/brand references.
 * Where artwork has not been verified, use a readable typographic identifier
 * rather than inventing a brand symbol. Calendar Link, Local Events and Waste
 * are generic service categories. No external image requests.
 */
const ICONS: Record<ConnectAppKey, LogoMark> = {
  "teams": {"background":"#0078D4","viewBox":"0 0 24 24","color":"#fff","paths":[{"d":"M7.88 12.04q0 .45-.11.87-.1.41-.33.74-.22.33-.58.52-.37.2-.87.2t-.85-.2q-.35-.21-.57-.55-.22-.33-.33-.75-.1-.42-.1-.86t.1-.87q.1-.43.34-.76.22-.34.59-.54.36-.2.87-.2t.86.2q.35.21.57.55.22.34.31.77.1.43.1.88zM24 12v9.38q0 .46-.33.8-.33.32-.8.32H7.13q-.46 0-.8-.33-.32-.33-.32-.8V18H1q-.41 0-.7-.3-.3-.29-.3-.7V7q0-.41.3-.7Q.58 6 1 6h6.5V2.55q0-.44.3-.75.3-.3.75-.3h12.9q.44 0 .75.3.3.3.3.75V10.85l1.24.72h.01q.1.07.18.18.07.12.07.25zm-6-8.25v3h3v-3zm0 4.5v3h3v-3zm0 4.5v1.83l3.05-1.83zm-5.25-9v3h3.75v-3zm0 4.5v3h3.75v-3zm0 4.5v2.03l2.41 1.5 1.34-.8v-2.73zM9 3.75V6h2l.13.01.12.04v-2.3zM5.98 15.98q.9 0 1.6-.3.7-.32 1.19-.86.48-.55.73-1.28.25-.74.25-1.61 0-.83-.25-1.55-.24-.71-.71-1.24t-1.15-.83q-.68-.3-1.55-.3-.92 0-1.64.3-.71.3-1.2.85-.5.54-.75 1.3-.25.74-.25 1.63 0 .85.26 1.56.26.72.74 1.23.48.52 1.17.81.69.3 1.56.3zM7.5 21h12.39L12 16.08V17q0 .41-.3.7-.29.3-.7.3H7.5zm15-.13v-7.24l-5.9 3.54Z"}]},
  "calendar-link": {"background":"#65758B","viewBox":"0 0 24 24","color":"#fff","paths":[{"d":"M4 4h3V2h2v2h6V2h2v2h3a2 2 0 0 1 2 2v5h-2V8H4v12h7v2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm9 11 2-2a3 3 0 0 1 4.2 0l1 1-1.4 1.4-1-1a1 1 0 0 0-1.4 0l-2 2a1 1 0 0 0 0 1.4l1 1-1.4 1.4-1-1a3 3 0 0 1 0-4.2zm4 6 2-2a1 1 0 0 0 0-1.4l-1-1 1.4-1.4 1 1a3 3 0 0 1 0 4.2l-2 2a3 3 0 0 1-4.2 0l-1-1 1.4-1.4 1 1a1 1 0 0 0 1.4 0z"}]},
  "google-calendar": {"background":"#FFFFFF","viewBox":"0 0 512 512","color":"#fff","paths":[{"d":"M387 117.5 265.7 104l-148.2 13.5L104 252.2 117.5 387l134.7 16.8L387 387l13.5-138.1z","fill":"#fff","transform":"translate(3.75 3.75)"},{"d":"M176.55 330.35c-10.1-6.8-17-16.7-20.9-29.9l23.4-9.6c2.1 8.1 5.8 14.3 11.1 18.8 5.3 4.4 11.7 6.6 19.1 6.6 7.6 0 14.2-2.3 19.7-7s8.3-10.6 8.3-17.8q0-10.95-8.7-18c-5.8-4.6-13.1-7-21.8-7h-13.5v-23.1h12.1c7.5 0 13.8-2 18.9-6.1 5.1-4 7.7-9.6 7.7-16.6q0-9.45-6.9-15c-4.6-3.7-10.4-5.6-17.4-5.6-6.9 0-12.3 1.8-16.4 5.5-4 3.7-7 8.2-8.8 13.5l-23.1-9.6c3.1-8.7 8.7-16.4 16.9-23 8.3-6.6 18.8-10 31.6-10 9.5 0 18 1.8 25.5 5.5s13.5 8.8 17.8 15.2c4.3 6.5 6.4 13.8 6.4 21.9 0 8.3-2 15.2-6 21q-6 8.55-14.7 13.2v1.4c7.6 3.2 13.9 8.1 18.8 14.7s7.3 14.4 7.3 23.6-2.3 17.3-7 24.5c-4.6 7.2-11.1 12.8-19.2 16.9-8.2 4.1-17.4 6.2-27.6 6.2-11.6 0-22.5-3.4-32.6-10.2m143.4-116-25.5 18.6-12.8-19.5 46-33.2h17.7v156.7h-25.3v-122.6z","fill":"#1a73e8"},{"d":"M387 508.2 508.2 387l-60.6-27-60.6 27-27 60.6z","fill":"#ea4335","transform":"translate(3.75 3.75)"},{"d":"m90.6 447.6 26.9 60.6H387V387H117.5z","fill":"#34a853","transform":"translate(3.75 3.75)"},{"d":"M36.7-3.8C14.3-3.8-3.8 14.3-3.8 36.7V387l60.6 26.9 60.6-26.9V117.5H387l26.9-60.6L387-3.8z","fill":"#4285f4","transform":"translate(3.75 3.75)"},{"d":"M-3.8 387v80.8c0 22.3 18.1 40.4 40.4 40.4h80.8V387z","fill":"#188038","transform":"translate(3.75 3.75)"},{"d":"M387 117.5V387h121.3V117.5l-60.6-26.9z","fill":"#fbbc04","transform":"translate(3.75 3.75)"},{"d":"M508.2 117.5V36.7c0-22.3-18.1-40.4-40.4-40.4H387v121.3h121.2z","fill":"#1967d2","transform":"translate(3.75 3.75)"}]},
  "bonnetid": {"background":"#315D50","viewBox":"0 0 24 24","color":"#fff","wordmark":"IRN","fontSize":11,"fontFamily":"Arial, sans-serif"},
  "local-events": {"background":"#536E91","viewBox":"0 0 24 24","paths":[{"d":"M9,10V12H7V10H9M13,10V12H11V10H13M17,10V12H15V10H17M19,3A2,2 0 0,1 21,5V19A2,2 0 0,1 19,21H5C3.89,21 3,20.1 3,19V5A2,2 0 0,1 5,3H6V1H8V3H16V1H18V3H19M19,19V8H5V19H19M9,14V16H7V14H9M13,14V16H11V14H13M17,14V16H15V14H17Z"}]},
  "spond": {"background":"#1878AE","viewBox":"0 0 24 24","paths":[{"d":"M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm-1.403 2.281a3.767 3.767 0 00-.17 2.847c.61 1.79 2.336 2.772 4.069 3.213 2.633.672 4.715 1.388 5.892 2.502 1.037.982 1.435 2.416.803 4.618-.17.59-.486 1.124-.802 1.643-.125-.706-.424-1.411-.924-2.094-3.269-4.462-10.438-3.57-13.174-7.307-.803-1.096-.747-2.236.092-3.288.979-1.226 2.69-1.917 4.214-2.134zm3.163.11c.138-.01.281.002.43.036a9.835 9.835 0 017.076 6.318c-1.514-1.132-3.655-1.86-6.233-2.517-1.528-.39-2.3-1.087-2.542-1.798-.326-.956.308-1.98 1.27-2.04zM3.611 6.895c.125.706.424 1.412.924 2.094 3.269 4.462 10.438 3.57 13.174 7.307.803 1.095.747 2.236-.092 3.288-.979 1.226-2.69 1.916-4.214 2.133.427-.89.489-1.91.17-2.846-.61-1.79-2.336-2.772-4.069-3.213-2.633-.672-4.715-1.388-5.892-2.502-1.037-.982-1.435-2.416-.803-4.618.17-.59.486-1.124.802-1.643zm-.877 8.36c1.514 1.13 3.655 1.858 6.233 2.516 1.528.39 2.3 1.087 2.542 1.798.336.985-.347 2.042-1.357 2.042-.11 0-.225-.012-.342-.039a9.835 9.835 0 01-7.076-6.318z"}]},
  "waste": {"background":"#66816D","viewBox":"0 0 24 24","paths":[{"d":"M9,3V4H4V6H5V19A2,2 0 0,0 7,21H17A2,2 0 0,0 19,19V6H20V4H15V3H9M9,8H11V17H9V8M13,8H15V17H13V8Z"}]},
  "todoist": {"background":"#E44332","viewBox":"0 0 24 24","color":"#fff","paths":[{"d":"M3 7.1 7.5 9.7 19 3l2 1.2-13.5 7.9L3 9.5zM3 12 7.5 14.6 19 7.9l2 1.2-13.5 7.9L3 14.4zM3 16.9l4.5 2.6L19 12.8l2 1.2-13.5 7.9L3 19.3z"}]},
  "google-tasks": {"background":"#4285F4","viewBox":"0 0 24 24","paths":[{"d":"M11.383.617C5.097.617 0 5.714 0 12c0 6.286 5.097 11.383 11.383 11.383 6.286 0 11.38-5.097 11.38-11.383a11.34 11.34 0 0 0-.878-4.389l-3.203 3.203c.062.387.1.782.1 1.186a7.398 7.398 0 1 1-7.4-7.398c1.499 0 2.889.448 4.054 1.214l2.857-2.857a11.325 11.325 0 0 0-6.91-2.342zm9.674.756c-.292 0-.583.112-.805.334-2.97 2.965-5.934 5.934-8.9 8.902L9.596 8.854a1.139 1.139 0 0 0-1.61 0l-1.775 1.773a1.139 1.139 0 0 0 0 1.61l4.166 4.163a1.421 1.421 0 0 0 2.012 0L23.666 5.121a1.136 1.136 0 0 0 0-1.61l-1.805-1.804a1.136 1.136 0 0 0-.804-.334z"}]},
  "microsoft-todo": {"background":"#FFFFFF","viewBox":"-0.02 53.05 512.07 405.9","color":"#fff","paths":[{"d":"m6.5 240.3 74.8-74.8c8.6-8.6 22.7-8.6 31.3 0l180.8 180.8c8.6 8.6 8.6 22.7 0 31.3l-74.8 74.8c-8.6 8.6-22.7 8.6-31.3 0L6.5 271.7c-8.7-8.7-8.7-22.7 0-31.4","fill":"#195ABD"},{"d":"m430.8 59.5 74.8 74.8c8.6 8.6 8.6 22.7 0 31.3l-287 286.9c-8.6 8.6-22.7 8.6-31.3 0l-74.8-74.8c-8.6-8.6-8.6-22.7 0-31.3L399.4 59.5c8.7-8.6 22.7-8.6 31.4 0","fill":"#39A4EB"}]},
  "vigilo": {"background":"#080D59","viewBox":"0 0 24 24","color":"#fff","paths":[{"d":"M3.5 6a3 3 0 0 1 4.3 0L12 10.2l3.5-3.5a3 3 0 0 1 4.3 4.3L14 17 9.7 12.7 3.5 10.3a3 3 0 0 1 0-4.3z","fill":"#4666F2"},{"d":"m9 10.5 4.1 4.1 2.3-2.3 2.9 2.9-4.2 4.2a3 3 0 0 1-4.2 0L6 15.5z","fill":"#DFB6AB"},{"d":"m11.5 13 3.7-3.6 4 4-4 4a2.2 2.2 0 0 0-1.2-3.5c-.8-.2-1.2.6-2.1.5-.9-.1-1.1-.6-.4-1.4z","fill":"#FFDBC3"}]},
  "transponder": {"background":"#45546F","viewBox":"0 0 24 24","color":"#fff","wordmark":"Transp.","fontSize":6.5,"fontFamily":"Arial, sans-serif"},
  "familywall": {"background":"#2B91C9","viewBox":"0 0 24 24","color":"#fff","paths":[{"d":"M13 4.2a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM9.5 13.2c1 .7 2.2 1 3.5 1s2.5-.3 3.5-1c1.1 2.1 1.6 4.5 1.6 7.1H7.9c0-2.6.5-5 1.6-7.1zM7.7 6.3c.8 0 1.5.2 2.1.6-.8 1.6-.8 3.5 0 5-1.2 1.5-4 1.5-5.3-.3-.7-1-1-2.4-.8-3.4.8.4 1.4-.4 1.9-.9.6-.6 1.3-1 2.1-1zM5 13.7c1 .4 2 .4 3 .2-.8 1.9-1.2 4-1.2 6.4H3.4c0-2.5.5-4.6 1.6-6.6zM18.8 8.1c1.1-1.4 2.5-1.2 3-.1.2.5.8.8 1.2.4.2 1.5-1.6 2-2.4.6a2.8 2.8 0 1 1-2.4 4.7c.6-1.4.8-3 .3-4.4zM19 14.5c.9.2 1.7 0 2.4-.4.6 1.8.9 3.9.9 6.2h-3.1c0-2.1-.3-4-.9-5.8zM.5 12.7l1.2.4.1-1.3 1.1.6.5-1.1c.5 1.6 1.1 2.2 2 2.9a2.5 2.5 0 0 1-4.9-1.5zm1 4.2c.8.3 1.4.2 2.1-.1-.2 1.3-.3 2.4-.3 3.5H1.5z"}]},
  "planta": {"background":"#17694D","viewBox":"0 0 24 24","color":"#fff","wordmark":"PLANTA","fontSize":6.2,"fontFamily":"Arial, sans-serif"},
  "surfline": {"background":"#151B24","viewBox":"0 0 24 24","color":"#fff","paths":[{"d":"M12 2C9.7 5.3 4 11.3 4 15.1a8 8 0 0 0 16 0c0-3.8-5.7-9.8-8-13.1z","fill":"#F4F8F8"},{"d":"M7.2 16c1.8-3.5 5.7-5.9 9.4-4.1-2.3-.3-4.5 1.5-4.5 3.6 0 1.7 1.2 2.6 3.8 2.9-3.1 1.9-7.3 1.1-8.7-2.4z","fill":"#151B24"}]},
  "meldinga": {"background":"#254A59","viewBox":"0 0 24 24","color":"#fff","wordmark":"meldinga","fontSize":5.5,"fontFamily":"Arial, sans-serif"},
  "fotmob": {"background":"#009B58","viewBox":"0 0 24 24","color":"#fff","paths":[{"d":"M5 2h15a1 1 0 0 1 1 1v3H9v5l-4 1.1zM5 19l4-2.4V22H5zM13 10.2a2.7 2.7 0 1 1 0 5.4 2.7 2.7 0 0 1 0-5.4zM1 14l8.3-2.2-.2 1.6L1 16.5zm0 3.6 8.7-3.5.7 1.1L1 20.4z"}]},
  "sofascore": {"background":"#465BF6","viewBox":"0 0 24 24","color":"#fff","wordmark":"Sofa","fontSize":10,"fontFamily":"Arial, sans-serif"},
  "yr": {"background":"#00B8E4","viewBox":"0 0 24 24","color":"#fff","paths":[{"d":"M2 6h2.5v3.5a2.8 2.8 0 0 0 5.6 0V6h2.5v7.9c0 3.4-1.9 5.5-4.2 6.8l-1.5-1.9c2.1-1.3 3.2-2.4 3.2-4.3a5.3 5.3 0 0 1-8.1-4.4zM14 19.9v-10a4.2 4.2 0 0 1 4.2-4.2h2a4.2 4.2 0 0 1 1.2 8.2l1.9 3.4H21l-2.3-3.3h-.5a1.7 1.7 0 0 0-1.7 1.7v4.2zm2.5-8.2h3.7a1.8 1.8 0 0 0 0-3.6h-2a1.7 1.7 0 0 0-1.7 1.7z"}]},
  "storm": {"background":"#36495F","viewBox":"0 0 24 24","color":"#fff","wordmark":"Storm","fontSize":8.2,"fontFamily":"Arial, sans-serif"},
  "skistar": {"background":"#D50032","viewBox":"0 0 24 24","color":"#fff","paths":[{"d":"M10.6 1h2.8v22h-2.8zM1 10.6h22v2.8H1zM4.2 2.3l17.5 17.5-2 2L2.3 4.2zM19.8 2.3l2 2L4.2 21.7l-2-2z"}]},
  "bring": {"background":"#2E3E47","viewBox":"0 0 24 24","color":"#fff","paths":[{"d":"M5 8h14l1 13-3 2-13-2z","fill":"#F5F7F8"},{"d":"m17 8 2 0 1 13-3 2z","fill":"#1EA298"},{"d":"M8 8V5a4 4 0 0 1 8 0v3h-2V5a2 2 0 0 0-4 0v3z","fill":"#F5F7F8"},{"d":"m7 14 2.3 2 4.5-5.2 1.8 1.6-6.1 7.1L5.5 16z","fill":"#1EA298"}]},
  "listonic": {"background":"#0D982F","viewBox":"0 0 24 24","color":"#fff","paths":[{"d":"M3 4h13v13h5v2a3 3 0 0 1-3 3H7a4 4 0 0 1-4-4z","fill":"#FFF"},{"d":"M5 8h8v1.7H5zm0 4h8v1.7H5zm0 4h6v1.7H5z","fill":"#62C842"},{"d":"m14 10 1.5-4 4.7-4.7 2.5 2.5L18 8.5z","fill":"#FFD044"},{"d":"m14 10 1.5-4 2.5 2.5z","fill":"#9B4636"}]},
  "nordnet": {"background":"#101820","viewBox":"0 0 24 24","color":"#fff","wordmark":"N","fontSize":17,"fontFamily":"Arial, sans-serif"},
  "vg": {"background":"#E30613","viewBox":"0 0 24 24","color":"#fff","wordmark":"VG","fontSize":14,"fontFamily":"Arial, sans-serif"},
  "aftenposten": {"background":"#202020","viewBox":"0 0 24 24","color":"#fff","wordmark":"A","fontSize":18,"fontFamily":"Georgia, serif"},
  "timeanddate": {"background":"#24557A","viewBox":"0 0 24 24","color":"#fff","wordmark":"time","fontSize":9,"fontFamily":"Arial, sans-serif"},
}

export default function ConnectAppLogo({ appKey }: { appKey: ConnectAppKey }) {
  const icon = ICONS[appKey]
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl ring-1 ring-inset ring-black/5"
      style={{ backgroundColor: icon.background }}
    >
      <svg viewBox={icon.viewBox} fill="none" className="h-[25px] w-[25px]" focusable="false">
        {icon.paths?.map((path, index) => (
          <path key={index} d={path.d} fill={path.fill || icon.color || '#fff'} transform={path.transform} />
        ))}
        {icon.wordmark && (
          <text x="12" y="12" dominantBaseline="central" textAnchor="middle"
            fontFamily={icon.fontFamily || 'Arial, sans-serif'} fontSize={icon.fontSize || 9}
            fontWeight="700" fill={icon.color || '#fff'}>
            {icon.wordmark}
          </text>
        )}
      </svg>
    </span>
  )
}
