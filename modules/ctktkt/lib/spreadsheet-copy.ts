export type CopyPoint={row:number;column:number};
export type CopyMode="cells"|"rows"|"columns";
export function copyBounds(anchor:CopyPoint,end:CopyPoint,mode:CopyMode,rows:number,columns:number){
  return {top:mode==="columns"?0:Math.min(anchor.row,end.row),bottom:mode==="columns"?rows-1:Math.max(anchor.row,end.row),left:mode==="rows"?0:Math.min(anchor.column,end.column),right:mode==="rows"?columns-1:Math.max(anchor.column,end.column)};
}
const escape=(text:string)=>text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const safeText=(text:string)=>/^[=+@-]/.test(text.trim())&&!/^[+-]?\d+(?:[.,]\d+)?$/.test(text.trim())?"'"+text:text;
/** TSV preserves the rectangle; HTML carries numeric types into Excel. */
export function spreadsheetCopyPayload(matrix:string[][]){
  return {
    text:matrix.map(row=>row.map(value=>safeText(value).replace(/[\t\r\n]+/g," ")).join("\t")).join("\r\n"),
    html:'<html xmlns:x="urn:schemas-microsoft-com:office:excel"><body><table>'+matrix.map(row=>"<tr>"+row.map(value=>{
      const numeric=/^[+-]?\d+(?:\.\d+)?$/.test(value.trim());
      return `<td${numeric?` x:num="${escape(value.trim())}"`:''}>${escape(safeText(value))}</td>`;
    }).join("")+"</tr>").join("")+"</table></body></html>",
  };
}
