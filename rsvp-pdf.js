// Branded RSVP PDF generator, shared by the RSVP page and the admin dashboard.
// Needs: jsPDF (/vendor/jspdf.umd.min.js), /accommodation.js, fonts in /vendor/fonts, photos in /assets.
(function(){
const FONT_FILES={'Cormorant:normal':'CormorantGaramond_400Regular.ttf','Cormorant:italic':'CormorantGaramond_400Regular_Italic.ttf','Jost:light':'Jost_300Light.ttf','Jost:normal':'Jost_400Regular.ttf','Jost:bold':'Jost_500Medium.ttf'};
let fontCache=null;
async function loadFonts(){
 if(fontCache)return fontCache;
 const out={};
 await Promise.all(Object.entries(FONT_FILES).map(async([k,f])=>{
  const r=await fetch('/vendor/fonts/'+f);if(!r.ok)throw new Error('font');
  const buf=new Uint8Array(await r.arrayBuffer());let bin='';for(let i=0;i<buf.length;i+=0x8000)bin+=String.fromCharCode.apply(null,buf.subarray(i,i+0x8000));
  out[k]=btoa(bin);
 }));
 return fontCache=out;
}
// Load a website photo and crop it ("cover") to the given aspect ratio, as JPEG.
function loadPhoto(src,aspect,maxW=1400){
 return new Promise(res=>{const im=new Image();im.onload=()=>{try{
   let sw=im.naturalWidth,sh=im.naturalHeight,sx=0,sy=0;
   if(sw/sh>aspect){const w=sh*aspect;sx=(sw-w)/2;sw=w}else{const h=sw/aspect;sy=(sh-h)*.35;sh=h}
   const cw=Math.min(maxW,Math.round(sw)),ch=Math.round(cw/aspect),c=document.createElement('canvas');c.width=cw;c.height=ch;
   c.getContext('2d').drawImage(im,sx,sy,sw,sh,0,0,cw,ch);res(c.toDataURL('image/jpeg',.88));}catch(e){res(null)}};
  im.onerror=()=>res(null);im.src=src;});
}
async function buildRsvpPdf(d){
 const J=window.jspdf&&window.jspdf.jsPDF;if(!J)return null;
 const doc=new J({unit:'pt',format:'a4'}),W=doc.internal.pageSize.getWidth(),H=doc.internal.pageSize.getHeight(),M=58,CW=W-M*2;
 // Brand fonts (Cormorant Garamond + Jost, as on the website); fall back to built-ins if they can't load.
 let serif='times',sans='helvetica',custom=false;
 try{const fonts=await loadFonts();
  for(const [k,b64] of Object.entries(fonts)){const [fam,st]=k.split(':'),file=FONT_FILES[k];doc.addFileToVFS(file,b64);doc.addFont(file,fam,st==='light'?'light':st);}
  serif='Cormorant';sans='Jost';custom=true;}catch(e){console.warn('PDF fonts unavailable',e)}
 const INK=[66,55,46],SOFT=[125,112,100],OLIVE=[119,120,94],GOLD=[168,155,119],LINE=[217,208,192],PAPER=[255,253,250],CREAM=[244,240,233];
 const font=(fam,st)=>{if(!custom){doc.setFont(fam==='Cormorant'?'times':'helvetica',st==='italic'?'italic':st==='bold'?'bold':'normal')}else doc.setFont(fam,st)};
 const sansW=st=>font(sans,custom?st:(st==='light'?'normal':st));
 const color=c=>doc.setTextColor(c[0],c[1],c[2]);
 const frame=()=>{doc.setFillColor(...PAPER);doc.rect(0,0,W,H,'F');doc.setDrawColor(182,172,147);doc.setLineWidth(.8);doc.rect(24,24,W-48,H-48);doc.setDrawColor(232,224,211);doc.setLineWidth(.5);doc.rect(30,30,W-60,H-60)};
 let y=0;
 const newPage=()=>{doc.addPage();frame();y=M+4};
 const need=h=>{if(y+h>H-M-8)newPage()};
 const spaced=(t,x,yy,sp,opts={})=>doc.text(t,x,yy,{charSpace:sp,...opts});
 const head=t=>{need(46);y+=14;sansW('bold');doc.setFontSize(8.5);color(OLIVE);spaced(t.toUpperCase(),M,y,2);y+=8;doc.setDrawColor(...LINE);doc.setLineWidth(.6);doc.line(M,y,W-M,y);y+=18};
 const row=(k,v)=>{doc.setFontSize(10.5);sansW('normal');const lines=doc.splitTextToSize(String(v==null||v===''?'-':v),CW-135);need(lines.length*15+4);sansW('light');color(SOFT);doc.text(k,M,y);sansW('bold');color(INK);doc.text(lines,M+135,y);y+=lines.length*15+3};
 const para=t=>{sansW('light');doc.setFontSize(10);color(INK);const l=doc.splitTextToSize(t,CW);need(l.length*14+4);doc.text(l,M,y);y+=l.length*14+6};
 const yes=d.attending,n=(window.NIGHTS||{})[d.stay]||0,BANK=window.BANK||{},ROOMS=window.ROOMS||[],roomOf=id=>ROOMS.find(r=>r.id===id),money=v=>'R'+Number(v).toLocaleString('en-ZA'),gN=d.guestCount||1,roomList=d.rooms||[];
 const [hero,photo2]=await Promise.all([loadPhoto('/assets/couple-1.webp',CW/230),loadPhoto('/assets/couple-5.webp',CW/150)]);
 frame();y=M-14;
 if(hero){doc.addImage(hero,'JPEG',M,y,CW,230);doc.setDrawColor(...GOLD);doc.setLineWidth(.6);doc.rect(M+5,y+5,CW-10,220);y+=230+34}else y+=20;
 color(OLIVE);sansW('normal');doc.setFontSize(8.5);spaced('RSVP CONFIRMATION',W/2,y,3,{align:'center'});y+=34;
 font(serif,'normal');doc.setFontSize(42);color(INK);doc.text('Christopher & Tatum',W/2,y,{align:'center'});y+=24;
 font(serif,'italic');doc.setFontSize(15);color(SOFT);doc.text('Saturday, 13 February 2027  ·  Lunikhy Game Farm, Bela-Bela',W/2,y,{align:'center'});y+=18;
 doc.setDrawColor(...GOLD);doc.setLineWidth(.8);doc.line(W/2-24,y,W/2+24,y);y+=6;
 head('Your RSVP');
 row('Name',(d.first+' '+d.last).trim());row('Email',d.email);
 row('Response',yes?'Joyfully accepts':'Regretfully declines');
 if(yes){
  row('Staying',d.stay==='both_nights'?'Both nights (Friday 12 & Saturday 13 February)':'Friday night only (12 February)');
  row('Number of guests',gN);
  row('Dietary (you)',d.diet||'None provided');
  (d.guestsList||[]).forEach((g,i)=>row('Guest '+(i+2),((g.first||'')+' '+(g.last||'')).trim()+'  (dietary: '+(g.diet||'none')+')'));
 }
 if(d.message)row('Your message',d.message);
 if(yes&&roomList.length){
  head('Accommodation');
  for(const {id,names} of roomList){const r=roomOf(id);if(!r)continue;row(names.length+(names.length===1?' person':' people'),'in '+r.label+'\n'+names.join(', ')+'\n'+names.length+' × '+n+(n===1?' night':' nights')+' × '+money(r.rate)+' = '+money(r.rate*names.length*n))}
  y+=8;need(70);
  doc.setFillColor(...CREAM);doc.setDrawColor(...OLIVE);doc.setLineWidth(.6);doc.roundedRect(M,y,CW,50,3,3,'FD');
  color(OLIVE);sansW('normal');doc.setFontSize(8);spaced('TOTAL DUE · VAT INCLUDED',M+16,y+19,2);
  font(serif,'normal');doc.setFontSize(26);color(INK);doc.text(money(d.total),M+16,y+42);
  sansW('light');doc.setFontSize(9.5);color(SOFT);doc.text(n+(n===1?' night':' nights')+' · '+gN+(gN===1?' guest':' guests'),W-M-16,y+36,{align:'right'});
  y+=50+20;
  para('Rates are per person, per night. Children sleeping in their own bed pay the full rate. Accommodation is 100% self-catering: please bring your own food, drinks and ice. Check-in is at 14:00 on Friday and check-out is at 10:00 on Sunday. The Deli is open Friday 08:00 to 22:00, Saturday 07:00 to 17:00 and Sunday 07:00 to 15:00. For accommodation questions contact Sherize (+76 344 4583) or Benjamin (+27 73 648 3142).');
  head('Friday 12 February');
  for(const [t,d] of [['14:00','Check-in at the accommodation'],['16:30','Make your way to the Deli'],['18:00','Casual dinner at the Deli'],['22:00','Bar closes']])row(t,d);
  para('We will arrange dinner for Friday night. Saturday and Sunday breakfast: guests are welcome to enjoy breakfast at the Deli.');
  head('How to pay');
  row('Amount',money(d.total));if(d.paid)row('Payment status','Received'+(d.paid.amount!=null?' '+money(d.paid.amount):'')+(d.paid.date?' on '+d.paid.date:''));row('Reference',d.reference);
  row('Bank',BANK.bank);row('Account holder',BANK.holder);row('Account type',BANK.type);row('Account number',BANK.number);row('Branch',BANK.branchName+' ('+BANK.branch+')');row('Swift code',BANK.swift);
  y+=4;para('Honeymoon gifts are entirely optional. If you would like to contribute, you can use the same account with the reference: your name + Honeymoon.');
 }
 // Closing: photo + sign-off
 need(150+24);y+=14;
 if(photo2){doc.addImage(photo2,'JPEG',M,y,CW,150);y+=150+26}
 font(serif,'italic');doc.setFontSize(20);color(INK);doc.text(yes?'We can’t wait to celebrate with you.':'Thank you for letting us know. You will be in our hearts.',W/2,y,{align:'center'});y+=16;
 sansW('light');doc.setFontSize(8.5);color(SOFT);spaced('WITH LOVE, CHRISTOPHER & TATUM',W/2,y+6,2,{align:'center'});
 const pages=doc.getNumberOfPages();
 for(let p=1;p<=pages;p++){doc.setPage(p);sansW('light');doc.setFontSize(7.5);color(SOFT);doc.text('Generated '+new Date().toLocaleDateString('en-ZA')+'  ·  page '+p+' of '+pages,W/2,H-38,{align:'center'})}
 return doc;
}

window.buildRsvpPdf=buildRsvpPdf;
})();
