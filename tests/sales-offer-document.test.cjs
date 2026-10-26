'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const source=read('sales-offer-document.js');
const sandbox={};
vm.runInNewContext(source.replace(/\bexport function\b/g,'function')+'\nthis.render=buildSalesOfferPrintHtml;',sandbox);
const render=sandbox.render;
const offer={
 offer_number:'DS-20261026-1234',title:'Gartenpflege <script>alert(1)</script>',
 status:'ready',created_at:'2026-10-26T10:00:00Z',valid_until:'2026-11-30',
 items:[{description:'Kirschlorbeer <img src=x onerror=alert(1)>',quantity:'2',unit_price:'100.00'}],
 net_amount:200,vat_rate:19,gross_amount:238
};
const inquiry={contact_name:'Herr <Frey>',email:'kunde@example.com',street:'Teststraße 9',postal_code:'80800',city:'München'};
const template={sender_name:'Duschl Service',sender_street:'Musterweg 1',sender_postal:'80800',sender_city:'München',
 intro_text:'Vielen Dank für Ihre Anfrage.',closing_text:'Wir freuen uns auf Ihre Rückmeldung.',tax_mode:'standard'};
const html=render({offer,inquiry,template});
assert.match(html,/DS-20261026-1234/);
assert.match(html,/@page\{size:A4/);
assert.match(html,/Drucken \/ als PDF speichern/);
assert.match(html,/238,00\s*€/);
assert.match(html,/38,00\s*€/);
assert.match(html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);
assert.match(html,/Herr &lt;Frey&gt;/);
assert.doesNotMatch(html,/ENTWURF \/ PRÜFEN/);
const draft=render({offer:{...offer,status:'draft',vat_rate:0,gross_amount:200},inquiry:{...inquiry,street:''},template:{...template,tax_mode:'small_business'}});
assert.match(draft,/ENTWURF \/ PRÜFEN/);
assert.match(draft,/Empfängeradresse prüfen/);
assert.match(draft,/Gemäß § 19 UStG/);
const without19=render({offer:{...offer,vat_rate:0,gross_amount:200},inquiry,template:{...template,tax_mode:'unspecified'}});
assert.doesNotMatch(without19,/Gemäß § 19 UStG/);
assert.match(without19,/Steuerliche Behandlung bei 0 % prüfen/);
assert.ok(html.indexOf('Kunden-Passwort')<0);
console.log('Offer A4 document renderer syntax and safety gate passed.');
