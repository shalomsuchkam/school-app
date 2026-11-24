import {createPrivateKey,sign} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const now=Math.floor(Date.now()/1000);
const unsigned=`${b64({alg:'ES256',kid:process.env.ASC_KEY_ID,typ:'JWT'})}.${b64({iss:process.env.ASC_ISSUER_ID,iat:now,exp:now+1200,aud:'appstoreconnect-v1'})}`;
const token=unsigned+'.'+sign('sha256',Buffer.from(unsigned),{key:createPrivateKey(process.env.ASC_KEY_P8),dsaEncoding:'ieee-p1363'}).toString('base64url');
async function api(path,method='GET',data){const r=await fetch('https://api.appstoreconnect.apple.com/'+(path.startsWith('v2/')?path:'v1/'+path),{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(data?{body:JSON.stringify({data})}:{})});const text=await r.text();if(!r.ok)throw Error(r.status+' '+text);return text?JSON.parse(text).data:null;}
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

if(apply){
 const detail=await api(`appStoreVersions/${v.id}/appStoreReviewDetail`);
 const old=detail.attributes.notes??'';
 const access=old.match(/FULL FAMILY ACCESS:[\s\S]*?(?=\n\n|$)/)?.[0];
 if(!access)throw Error('Existing demo access instructions must be preserved');
 const notes='BUILD 73 — RESPONSE TO NOVEMBER 23 REVIEW\n\n5.1.1(iv): opening a task camera now directly requests the native system camera permission. The custom pre-permission screen and its Allow camera / Back choices are removed. After denial, the app does not request again automatically; it offers Settings and Back. Denying camera access does not prevent leaving the camera or using other features.\n\n2.3.10: iOS interface text in Russian, Kazakh and English now uses store-specific wording without competing platform references. The phone setup guide on iOS shows only Apple Screen Time. The Russian App Store description is updated; old Screen Time and Settings screenshots containing those references were removed from every existing screenshot set. Other screenshots remain unchanged.\n\n'+access+'\n\niOS CHILD SCREEN TIME: use a physical child iPhone in Apple Family Sharing, authorize with the parent and select apps on that child device. Bedtime, school time, homework rules and a shared limit for selected apps are supported. Usage statistics remain on the child device.\n\nPDF: user-selected local files only. Optional location sharing remains visible and consent-based. Support: https://urokiapp.kz/support';
 if(notes.length>4000)throw Error('Review notes too long');
 await api(`appStoreReviewDetails/${detail.id}`,'PATCH',{type:'appStoreReviewDetails',id:detail.id,attributes:{notes}});
 console.log('REVIEW_NOTES_UPDATED',notes.length);
}

const infos=await api('apps/6827758955/appInfos');
for(const info of infos){
 const localizations=await api(`appInfos/${info.id}/appInfoLocalizations`);
 for(const loc of localizations){
  console.log('APP_INFO',loc.attributes.locale,JSON.stringify({name:loc.attributes.name,subtitle:loc.attributes.subtitle}));
  if(/Android|Google Play|Family Link/i.test((loc.attributes.name??'')+' '+(loc.attributes.subtitle??'')))throw Error('Competing platform reference in app information');
 }
}

const uploads=await api('apps/6827758955/buildUploads?limit=10');
console.log('BUILD_UPLOADS',JSON.stringify(uploads.map(u=>({id:u.id,attributes:u.attributes}))));

const availability=await api('apps/6827758955/appAvailabilityV2');
const territories=await api(`v2/appAvailabilities/${availability.id}/territoryAvailabilities?limit=200&include=territory`);
console.log('TERRITORIES',JSON.stringify(territories.map(t=>({id:t.id,territory:t.relationships.territory.data.id,available:t.attributes.available}))));
if(process.env.EXCLUDE_MAINLAND_CHINA==='true'){
 const china=territories.find(t=>t.relationships.territory.data.id==='CHN');
 if(!china)throw Error('Mainland China territory missing');
 if(china.attributes.available)await api(`territoryAvailabilities/${china.id}`,'PATCH',{type:'territoryAvailabilities',id:china.id,attributes:{available:false}});
 const checked=await api(`v2/appAvailabilities/${availability.id}/territoryAvailabilities?limit=200&include=territory`);
 for(const t of territories){const after=checked.find(x=>x.id===t.id);if(!after || after.attributes.available!==(t.id===china.id?false:t.attributes.available))throw Error('Unexpected territory availability change');}
 console.log('MAINLAND_CHINA_EXCLUDED_OTHER_TERRITORIES_UNCHANGED');
}
