// Self-contained browser PDF export for editorial design reviews.
// Each page embeds the actual 800×480 SVG cell renderings at 3× resolution.
// No server changes or third-party PDF package required.
const bytes = value => new TextEncoder().encode(String(value))
const combine = parts => {
  const length=parts.reduce((sum,part)=>sum+part.length,0)
  const out=new Uint8Array(length)
  let offset=0
  for(const part of parts){out.set(part,offset);offset+=part.length}
  return out
}
const cleanAscii = value => String(value??'').replace(/[^\x20-\x7e]/g,'-')
  .replace(/[()\\]/g,' ')
const pdfText = value => '('+cleanAscii(value)+')'

// Accepts a list of {jpeg:Uint8Array,width,height,seed,modules,presetId}.
// Produces an entirely offline multi-page PDF, one full-sized layout per page.
export function buildEditorialReviewPdf(pages,{theme='light',weatherScene='partly',typography='original'}={}){
  if(!Array.isArray(pages)||!pages.length||pages.length>100)
    throw new RangeError('Expected between 1 and 100 frame previews')
  const pageWidth=960,pageHeight=680
  const objects=[
    [bytes('<< /Type /Catalog /Pages 2 0 R >>')],
    null,
  ]
  const pageIds=[]
  pages.forEach((page,index)=>{
    if(!(page.jpeg instanceof Uint8Array)||page.jpeg.length<4)
      throw new TypeError('Missing JPEG image for preview '+(index+1))
    const pageId=3+index*3,imageId=pageId+1,contentId=pageId+2
    pageIds.push(pageId)
    objects.push([bytes('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+
      pageWidth+' '+pageHeight+'] /Resources << /XObject << /Im0 '+
      imageId+' 0 R >> /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >>'+
      ' /Contents '+contentId+' 0 R >>')])
    objects.push([
      bytes('<< /Type /XObject /Subtype /Image /Width '+page.width+
        ' /Height '+page.height+' /ColorSpace /DeviceRGB /BitsPerComponent 8'+
        ' /Filter /DCTDecode /Length '+page.jpeg.length+' >>\nstream\n'),
      page.jpeg,bytes('\nendstream'),
    ])
    const label='RE:MIND / Layout review '+(index+1)+' of '+pages.length
    const details='Seed '+page.seed+'  |  '+page.modules.length+
      ' modules  |  '+page.presetId
    const legend='Modules: '+page.modules.join(', ')+'  |  Theme: '+theme+
      '  |  Weather: '+weatherScene+'  |  Typography: '+typography
    const instructions='Review the full-size composition, readability, balance and hierarchy.'
    const commands=[
      'q','0.90 G','0.7 w','38 76 884 530 re S','Q',
      'q','884 0 0 530 38 76 cm','/Im0 Do','Q',
      'BT','/F1 19 Tf','0 g','38 638 Td',pdfText(label),'Tj','ET',
      'BT','/F1 11 Tf','0.32 g','38 616 Td',pdfText(details),'Tj','ET',
      'BT','/F1 10 Tf','0.32 g','38 54 Td',pdfText(legend),'Tj','ET',
      'BT','/F1 9 Tf','0.45 g','38 35 Td',pdfText(instructions),'Tj','ET',
    ].join('\n')+'\n'
    const contents=bytes(commands)
    objects.push([bytes('<< /Length '+contents.length+' >>\nstream\n'),
      contents,bytes('endstream')])
  })
  objects[1]=[bytes('<< /Type /Pages /Kids ['+
    pageIds.map(id=>id+' 0 R').join(' ')+'] /Count '+pages.length+' >>')]
  const output=[bytes('%PDF-1.4\n%RE:MIND\n')]
  const offsets=[0]
  let current=output[0].length
  objects.forEach((parts,index)=>{
    offsets.push(current)
    const obj=combine([bytes((index+1)+' 0 obj\n'),...parts,bytes('\nendobj\n')])
    output.push(obj)
    current+=obj.length
  })
  const xrefStart=current
  const xref=['xref','0 '+(objects.length+1),'0000000000 65535 f ']
  for(const offset of offsets.slice(1))
    xref.push(String(offset).padStart(10,'0')+' 00000 n ')
  xref.push('trailer','<< /Size '+(objects.length+1)+' /Root 1 0 R >>',
    'startxref',String(xrefStart),'%%EOF')
  output.push(bytes(xref.join('\n')+'\n'))
  return combine(output)
}

const decodeJpeg = dataUrl => {
  const data=atob(dataUrl.slice(dataUrl.indexOf(',')+1))
  const out=new Uint8Array(data.length)
  for(let i=0;i<data.length;i++)out[i]=data.charCodeAt(i)
  return out
}
async function drawCell(ctx,sourceSvg,x,y,width,height,scale,typography){
  // Serialized SVG images cannot reliably access a page's loaded web fonts.
  // For the font-shortlist review, rasterize the ornamental SVG first and
  // draw its main text with Canvas using the browser's actual self-hosted fonts.
  // This avoids silently exporting fallback Georgia/Arial while the on-screen
  // sample uses Instrument Serif, Fraunces and DM Sans.
  const replaceText=typography!=='original'&&
    sourceSvg.getAttribute('data-module')!=='surf-medium-approved'&&
    !(sourceSvg.getAttribute('data-module')==='surf'&&width===400&&height===240)
  const sourceText=replaceText
    ?Array.from(sourceSvg.querySelectorAll('text[data-audit-block]')):[]
  const copy=sourceSvg.cloneNode(true)
  if(replaceText)
    copy.querySelectorAll('text[data-audit-block]').forEach(node=>node.remove())
  const svg=new XMLSerializer().serializeToString(copy)
  const blob=new Blob([svg],{type:'image/svg+xml;charset=utf-8'})
  const url=URL.createObjectURL(blob)
  try{
    const image=new Image()
    image.src=url
    await image.decode()
    ctx.drawImage(image,x*scale,y*scale,width*scale,height*scale)
    if(sourceText.length){
      ctx.save()
      ctx.beginPath()
      ctx.rect(x*scale,y*scale,width*scale,height*scale)
      ctx.clip()
      for(const text of sourceText){
        const family=text.getAttribute('font-family')||'Arial, sans-serif'
        const size=Number(text.getAttribute('font-size')||13)
        const weight=text.getAttribute('font-weight')||'400'
        await document.fonts.load(weight+' '+size+'px '+family)
        ctx.font=weight+' '+size*scale+'px '+family
        ctx.textAlign='center'
        ctx.textBaseline='middle'
        ctx.fillStyle=text.getAttribute('fill')||'#000000'
        ctx.globalAlpha=Number(text.getAttribute('opacity')||1)
        ctx.fillText(text.textContent||'',
          (x+Number(text.getAttribute('x')||0))*scale,
          (y+Number(text.getAttribute('y')||0))*scale)
      }
      ctx.restore()
    }
  }finally{
    URL.revokeObjectURL(url)
  }
}
export async function exportEditorialBatchPdf(container,designs,
  {theme='light',weatherScene='partly',typography='original'}={}){
  if(!container||!Array.isArray(designs)||!designs.length)
    throw new Error('Generate previews before exporting')
  await document.fonts.ready
  const scale=designs.length>25?2:3
  const canvas=document.createElement('canvas')
  canvas.width=800*scale
  canvas.height=480*scale
  const ctx=canvas.getContext('2d',{alpha:false})
  if(!ctx)throw new Error('This browser does not support canvas export')
  const pages=[]
  for(let i=0;i<designs.length;i++){
    const design=designs[i]
    const preview=container.querySelector('[data-batch-preview="'+i+'"]')
    if(!preview)throw new Error('Preview '+(i+1)+' is not available')
    ctx.fillStyle=theme==='dark'?'#000000':'#ffffff'
    ctx.fillRect(0,0,canvas.width,canvas.height)
    for(const tile of design.tiles){
      const tileRoot=[...preview.querySelectorAll('[data-export-tile]')]
        .find(node=>node.getAttribute('data-export-tile')===tile.id)
      const svg=tileRoot?.querySelector('svg[data-editorial-probe]')
      if(!svg)throw new Error('Module art is missing in preview '+(i+1))
      await drawCell(ctx,svg,tile.x*200,tile.y*120,tile.cols*200,tile.rows*120,scale,typography)
    }
    pages.push({
      jpeg:decodeJpeg(canvas.toDataURL('image/jpeg',designs.length>25?0.90:0.96)),
      width:canvas.width,height:canvas.height,
      seed:design.seed,presetId:design.presetId,
      modules:design.tiles.map(tile=>tile.module),
    })
  }
  const data=buildEditorialReviewPdf(pages,{theme,weatherScene,typography})
  const blob=new Blob([data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)],
    {type:'application/pdf'})
  const url=URL.createObjectURL(blob)
  const link=document.createElement('a')
  link.href=url
  link.download='RE-MIND-layout-review-'+designs.length+'.pdf'
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(()=>URL.revokeObjectURL(url),15000)
  return pages.length
}
