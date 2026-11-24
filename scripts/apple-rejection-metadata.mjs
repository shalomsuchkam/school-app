import {createPrivateKey,sign} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const now=Math.floor(Date.now()/1000);
const unsigned=`${b64({alg:'ES256',kid:process.env.ASC_KEY_ID,typ:'JWT'})}.${b64({iss:process.env.ASC_ISSUER_ID,iat:now,exp:now+1200,aud:'appstoreconnect-v1'})}`;
const token=unsigned+'.'+sign('sha256',Buffer.from(unsigned),{key:createPrivateKey(process.env.ASC_KEY_P8),dsaEncoding:'ieee-p1363'}).toString('base64url');
async function api(path,method='GET',data){const r=await fetch('https://api.appstoreconnect.apple.com/v1/'+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(data?{body:JSON.stringify({data})}:{})});const text=await r.text();if(!r.ok)throw Error(r.status+' '+text);return text?JSON.parse(text).data:null;}
const versions=await api('apps/6827758955/appStoreVersions?filter[platform]=IOS&filter[versionString]=1.0.0');
if(versions.length!==1)throw Error('Unexpected versions');
const v=versions[0];console.log('VERSION',v.id,v.attributes.appStoreState);
const locales=await api(`appStoreVersions/${v.id}/appStoreVersionLocalizations`);
const apply=process.env.APPLY==='true';
if(apply && v.attributes.appStoreState!=='REJECTED')throw Error('Expected rejected candidate');
for(const loc of locales){
 console.log('LOCALE',loc.id,loc.attributes.locale,'DESCRIPTION',loc.attributes.description);
 if(apply && loc.attributes.locale==='ru'){
  const description=(await readFile('docs/store/ios-description.ru.txt','utf8')).trim();
  if(/Android|Google Play/i.test(description))throw Error('Competing platform reference');
  await api(`appStoreVersionLocalizations/${loc.id}`,'PATCH',{type:'appStoreVersionLocalizations',id:loc.id,attributes:{description}});
  console.log('DESCRIPTION_UPDATED',loc.attributes.locale);
 }
 const sets=await api(`appStoreVersionLocalizations/${loc.id}/appScreenshotSets?limit=200`);
 for(const set of sets){
  const shots=await api(`appScreenshotSets/${set.id}/appScreenshots?limit=200`);
  console.log('SET',set.id,set.attributes.screenshotDisplayType,JSON.stringify(shots.map(s=>({id:s.id,file:s.attributes.fileName,state:s.attributes.assetDeliveryState?.state,image:s.attributes.imageAsset}))));
  for(const shot of shots){
   if(apply && /^(3-screen|(?:iphone|ipad)-02-screen-time|iphone-04-settings)\.png$/i.test(shot.attributes.fileName)){
    if(shots.length<2)throw Error('Cannot leave an empty screenshot set');
    await api(`appScreenshots/${shot.id}`,'DELETE');console.log('REMOVED_PLATFORM_SCREENSHOT',shot.id);
   }
  }
 }
}
