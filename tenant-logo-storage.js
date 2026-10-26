// Optimized tenant-logo upload: keeps transparent areas, private Storage, never embeds the original 5 MB file in JSON.
const MAX_UPLOAD=5*1024*1024;
function supported(file){return ['image/png','image/jpeg','image/webp'].includes(file?.type)&&file.size<=MAX_UPLOAD&&file.size>0;}
async function optimize(file){
 if(!supported(file))throw Error('Bitte PNG, JPG oder WebP bis 5 MB auswählen.');
 const bitmap=await createImageBitmap(file);
 try{
  if(bitmap.width>6000||bitmap.height>6000||bitmap.width*bitmap.height>24000000)throw Error('Bildabmessungen zu groß.');
  const ratio=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*ratio);canvas.height=Math.round(bitmap.height*ratio);
  canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',0.90));
  if(!blob||!blob.size||blob.size>MAX_UPLOAD)throw Error('Logo konnte nicht optimiert werden.');
  return blob;
 }finally{bitmap.close();}
}
export function createTenantLogoStorage({request,organizationId}){
 if(typeof request!=='function'||!organizationId)throw Error('Storage-Kontext fehlt.');
 const bucket='tenant-logos';
 return {
  async upload(file){
   const blob=await optimize(file);
   const path=organizationId+'/logo-'+crypto.randomUUID()+'.webp';
   await request('/storage/v1/object/'+bucket+'/'+path,{method:'POST',headers:{'Content-Type':'image/webp','x-upsert':'false'},body:blob});
   return path;
  },
  async imageData(path){
   if(!path)return null;
   if(!path.startsWith(organizationId+'/'))throw Error('Mandantenfremder Logo-Pfad.');
   const blob=await request('/storage/v1/object/authenticated/'+bucket+'/'+path,{method:'GET'});
   if(!(blob instanceof Blob)||blob.size>MAX_UPLOAD)throw Error('Logodatei konnte nicht geladen werden.');
   return await new Promise((resolve,reject)=>{const rd=new FileReader();rd.onload=()=>resolve(rd.result);rd.onerror=()=>reject(Error('Logodatei unlesbar'));rd.readAsDataURL(blob)});
  }
 };
}
