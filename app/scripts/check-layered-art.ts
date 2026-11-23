/** Проверка настоящих исходных слоёв перед приёмкой; node scripts/check-layered-art.ts. */
import sharp from 'sharp';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ANIMATED_04 } from '../src/core/word-art-04-animated.ts';
const errors: string[] = [];
for (const [id,spec] of Object.entries(ANIMATED_04)) {
  const dir=join(import.meta.dirname,'../../art-inbox',spec.src);
  const src=JSON.parse(readFileSync(join(dir,'layers.json'),'utf8')).scenes[id];
  if(spec.motion.bg || Object.keys(spec.motion).length<2) errors.push(`${id}: нужен неподвижный фон и 2+ подвижных слоя`);
  const inputs: Buffer[]=[];
  for(const layer of src.layers) {
    const file=join(dir,layer.file);
    const {data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    if(info.width!==1024 || info.height!==1024) errors.push(`${id}/${layer.file}: неверный холст`);
    let clear=0;for(let i=3;i<data.length;i+=4) if(data[i]===0)clear++;
    if(layer.role==='background' && clear) errors.push(`${id}: дыры в фоне`);
    if(layer.role!=='background' && clear<1024*1024*.05) errors.push(`${id}/${layer.file}: отсутствует настоящая прозрачность`);
    if((layer.opacity??1)!==0) inputs.push(await sharp(file).png().toBuffer());
  }
  const assembled=await sharp(inputs[0]).composite(inputs.slice(1).map(input=>({input}))).ensureAlpha().raw().toBuffer();
  const full=await sharp(join(dir,src.full)).ensureAlpha().raw().toBuffer();
  if(assembled.length!==full.length || !assembled.equals(full)) errors.push(`${id}: full не совпадает со сборкой стека`);
  const gen=JSON.parse(readFileSync(join(import.meta.dirname,'../src/core/word-art.gen.json'),'utf8'))[id];
  const bytes=gen.layers.reduce((sum:number,l:{name:string})=>sum+statSync(join(import.meta.dirname,'../public/words',id,l.name+'.webp')).size,0);
  if(bytes>120*1024) errors.push(`${id}: превышен лимит 120 КБ`);
  console.log(`${id}: ${src.layers.length} слоёв, ${(bytes/1024).toFixed(1)} КБ`);
}
if(errors.length) { console.error(errors.join('\n')); process.exitCode=1; }
