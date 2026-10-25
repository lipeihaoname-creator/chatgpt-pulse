// Compare source bytes to production assets; hashed names retain exact identity.
import fs from 'node:fs';
import crypto from 'node:crypto';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const assets=new Map(fs.readdirSync('dist/assets').map(name=>[hash(fs.readFileSync('dist/assets/'+name)),'/assets/'+name]));
export function assetUrl(source){
 const url=assets.get(hash(fs.readFileSync(source)));
 if(!url)throw Error('Source asset missing from production bundle: '+source);
 return url;
}
