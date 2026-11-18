export type AladhanPreview = {
 provider: 'AlAdhan';city:string;date:string;timeZone:'Europe/Oslo';
 method:{id:number;name:string};asrMethod:1|2;highLatitudeMethod:string;
 coordinates:{latitude:number;longitude:number};
 times:Array<{name:string;time:string}>;
 hijri:{date:string;holidays:string[]}
}
export const METHODS: number[]
export function safeCity(x:unknown):string|null
export function validDate(x:unknown):boolean
export function prayerClock(x:unknown):string|null
export function aladhanUrl(x:{city:string;date:string;asrMethod:1|2;method:number;highLatitude:number}):URL
export function normalizeAladhan(x:unknown,args:{city:string;date:string;asrMethod:1|2;method:number;coordinates?:{latitude:number;longitude:number}}):AladhanPreview

export function aladhanCoordinatesUrl(x:{latitude:number;longitude:number;date:string;asrMethod:1|2;method:number;highLatitude:number}): URL
