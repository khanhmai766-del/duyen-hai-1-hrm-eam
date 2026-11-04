export const GOOGLE_MIRROR_FILES = [
 {key:'data',module:'data',label:'Dữ liệu các tháng',id:'1f2fjtOrtbnnMT0BLkkqyuXH1o8Bkz9YaWkx9jtgC-bg'},
 {key:'ctktkt',module:'ctktkt',label:'Báo cáo CTKTKT',id:'1p5Je-rfCGi-EesWtoABoJaz_pKxxrK554muW7Ab-WIs'},
 {key:'ppa',module:'ppa',label:'Suất hao nhiệt PPA',id:'1u1h3hemm6veJE0zUATTScyVPSW6MwINSC6tMno0gRCI'},
 {key:'bcsx-s1',module:'bcsx',label:'BCSX S1',id:'1-ud17AEnbCErcZemF8ir6k5rKe-wke7PPUPrY7fNQ0U'},
 {key:'bcsx-s2',module:'bcsx',label:'BCSX S2',id:'1cHTHpmh57MhZglIajvMrUH1jxVZ8SB1dPVB2CDkRyoQ'},
 {key:'bcsx-a0',module:'bcsx',label:'BCSX toàn nhà máy',id:'1EPu39HYVA0OHIe_dTGLYGYOK9o9QAhS7ALMsU7XkXKI'},
 {key:'water',module:'water',label:'Theo dõi lượng nước',id:'1qpQ_C6jiXeo4ljeZFxbTi7Ke6I2XuRY7W9Gar9JB3dE'},
 {key:'chemical',module:'chemical-usage',label:'Theo dõi hóa chất',id:'13PvvuFgBVR6c0yJWL4SqN9Crrrjm-hdLiCUXqkxBMuI'},
 {key:'pmis',module:'pmis',label:'Báo cáo PMIS',id:'1Sunb6asALfHG3TeHmNgCcR30r5xe4lgDiKdAWB1CNJk'},
] as const;
export type MirrorKey = typeof GOOGLE_MIRROR_FILES[number]['key'];
export function mirrorFile(key:string){return GOOGLE_MIRROR_FILES.find(f=>f.key===key);}
export function mirrorUrl(id:string){return `https://docs.google.com/spreadsheets/d/${id}/view`;}
export function validMirrorPeriod(value:string){return /^20\d{2}-(0[1-9]|1[0-2])$/.test(value);}
export type MirrorCell = string|number|boolean|null|{formula:string};
export type MirrorTab = {name:string;template?:string;rows:MirrorCell[][];startRow?:number;startColumn?:number;clearRows?:number;clearColumns?:number};
