// uso: node exp3.js <dff> <txd> <outdir>   (conversor DFF de carro -> JSON; nomes de frame lidos do chunk 0x253F2FE)
const { DffParser, TxdParser } = require('rw-parser');
const fs=require('fs');
const [,, dffp, txdp, out]=process.argv;
const raw=fs.readFileSync(dffp);
const log=console.log; console.log=()=>{};
const dff=new DffParser(raw).parse(); const txd=new TxdParser(fs.readFileSync(txdp)).parse();
console.log=log;
const names=[]; for(let i=raw.indexOf(Buffer.from([0xFE,0xF2,0x53,0x02])); i>=0 && i<raw.length; i=raw.indexOf(Buffer.from([0xFE,0xF2,0x53,0x02]),i+4)){ const ln=raw.readUInt32LE(i+4); if(ln<64) names.push(raw.slice(i+12,i+12+ln).toString('latin1').split('\0')[0]); }
const c=dff.clumps[0]; const fr=c.frameList.frames;
if(names.length!==fr.length) log('AVISO nomes',names.length,'frames',fr.length);
function mat(f){ const r=f.rotationMatrix,o=f.coordinatesOffset; return [[r.right.x,r.up.x,r.at.x,o.x],[r.right.y,r.up.y,r.at.y,o.y],[r.right.z,r.up.z,r.at.z,o.z],[0,0,0,1]]; }
const mul=(a,b)=>a.map((_,i)=>[0,1,2,3].map(j=>a[i][0]*b[0][j]+a[i][1]*b[1][j]+a[i][2]*b[2][j]+a[i][3]*b[3][j]));
function world(i){ let m=mat(fr[i]); let p=fr[i].parentFrame; while(p>=0){ m=mul(mat(fr[p]),m); p=fr[p].parentFrame; } return m; }
fs.mkdirSync(out,{recursive:true});
const frameInfo=fr.map((f,i)=>({name:names[i],pos:[world(i)[0][3],world(i)[1][3],world(i)[2][3]]}));
const chainOf=(i)=>{const o=[];let p=i;while(p>=0){o.push(names[p]);p=fr[p].parentFrame;}return o;};
const atoms=[];
c.atomics.forEach((a,k)=>{
  const g=c.geometryList.geometries[a.geometryIndex]; const W=world(a.frameIndex); const n=g.vertexInformation.length;
  const pos=[],nor=[],uv=[];
  for(let i=0;i<n;i++){ const v=g.vertexInformation[i]; for(let r=0;r<3;r++) pos.push(W[r][0]*v.x+W[r][1]*v.y+W[r][2]*v.z+W[r][3]);
    const nn=g.normalInformation?.[i]||{x:0,y:0,z:1}; for(let r=0;r<3;r++) nor.push(W[r][0]*nn.x+W[r][1]*nn.y+W[r][2]*nn.z);
    const t=g.textureMappingInformation?.[0]?.[i]||{u:0,v:0}; uv.push(t.u,t.v); }
  atoms.push({chain:chainOf(a.frameIndex),strip:!!g.isTriangleStrip,name:names[a.frameIndex],pos,nor,uv,bins:g.binMesh.meshes.map(m=>({mat:m.materialIndex,idx:m.indices})),mats:g.materialList.materialData.map(m=>({color:[m.color.r,m.color.g,m.color.b,m.color.a],tex:m.texture?.textureName||null}))});
});
const texs=[]; for(const t of txd.textureDictionary.textureNatives){ fs.writeFileSync(`${out}/tex_${t.textureName}.rgba`,Buffer.from(t.mipmaps[0])); texs.push({name:t.textureName,w:t.width,h:t.height,alpha:t.alpha}); }
fs.writeFileSync(`${out}/car.json`,JSON.stringify({frames:frameInfo,atoms,texs}));
log(out,'átomos',atoms.map(a=>a.name).join(' '));
log('cores', JSON.stringify([...new Set(atoms.flatMap(a=>a.mats.map(m=>m.color.join(','))))]));
