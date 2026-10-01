import { chromium } from "@playwright/test";
const out = "/home/user/Offices-App/portfolio/assets";
const mk = (o)=>o;
const clients = [
  { id:"c1", name:"Maria Alvarez", email:"maria@example.com", phone:"(312) 555-0142", smsConsent:true, addressLine1:"418 W Grace St", city:"Chicago", state:"IL", postalCode:"60613" },
  { id:"c2", name:"Greenfield Dental", email:"office@greenfielddental.example", phone:"(708) 555-0177", smsConsent:true, addressLine1:"2210 S Harlem Ave", city:"Berwyn", state:"IL", postalCode:"60402" },
  { id:"c3", name:"Tom Becker", email:"tom@example.com", phone:"(773) 555-0109", smsConsent:false, addressLine1:"907 N Oak Park Ave", city:"Oak Park", state:"IL", postalCode:"60302" },
  { id:"c4", name:"Lakeview Bakery", email:"hello@lakeviewbakery.example", phone:"(312) 555-0188", smsConsent:true, addressLine1:"3320 N Broadway", city:"Chicago", state:"IL", postalCode:"60657" },
];
const li = (d,q,p,k)=>({id:d,description:d,quantity:q,unitPrice:p,amount:q*p,kind:k});
const items1=[li("Replace capacitor (45/5 MFD)",1,38,"PART"),li("Condenser fan motor",1,214.5,"PART"),li("Labor – AC diagnosis & repair",2.5,95,"LABOR")];
const inv = (id,n,status,c,items,extra={})=>{const s=items.reduce((a,b)=>a+b.amount,0);const t=+(s*0.0725).toFixed(2);return {id,invoiceNumber:n,publicToken:"demo-token",status,subtotal:s,tax:t,total:+(s+t).toFixed(2),dueDate:"2026-10-15T00:00:00Z",sentAt:"2026-09-28T15:00:00Z",paidAt:status==="PAID"?"2026-09-29T18:20:00Z":null,createdAt:"2026-09-28T14:00:00Z",client:c,lineItems:items,notes:"Thank you for your business!",deliveries:[{channel:"SMS",recipient:c.phone,success:true},{channel:"EMAIL",recipient:c.email,success:true}],...extra};};
const invoices=[
  inv("i1","INV-000014","SENT",clients[0],items1),
  inv("i2","INV-000013","PAID",clients[1],[li("Annual furnace tune-up",1,189,"LABOR"),li("Furnace filter 16x25x1",2,14.25,"PART")]),
  inv("i3","INV-000012","OVERDUE",clients[2],[li("Water heater flush",1,145,"LABOR"),li("Anode rod",1,62,"PART")]),
  inv("i4","INV-000011","DRAFT",clients[3],[li("Replace 20A GFCI outlet",3,41,"PART"),li("Labor – electrical",1.5,110,"LABOR")]),
  inv("i5","INV-000010","PAID",clients[0],[li("Thermostat install (smart)",1,265,"LABOR"),li("Smart thermostat",1,129,"PART")]),
];
const techs=[{id:"u1",name:"Baraa Eldeirawi",email:"owner@demo.example",role:"OWNER"},{id:"u2",name:"Jordan Reyes",email:"jordan@demo.example",role:"TECH",phone:"(312) 555-0131"},{id:"u3",name:"Sam Okafor",email:"sam@demo.example",role:"TECH",phone:"(312) 555-0166"}];
const job=(id,title,type,status,c,t,day)=>({id,title,jobType:type,status,scheduledAt:`2026-10-${day}T15:00:00Z`,addressLine1:c.addressLine1,city:c.city,state:c.state,postalCode:c.postalCode,clientId:c.id,assignedTechId:t.id,client:c,assignedTech:{id:t.id,name:t.name},invoice:null,quote:null,voiceNotes:[]});
const jobs=[job("j1","AC not cooling – diagnose & repair","HVAC","IN_PROGRESS",clients[0],techs[1],"01"),job("j2","Annual furnace tune-up","HVAC","SCHEDULED",clients[1],techs[2],"02"),job("j3","Water heater flush","Plumbing","SCHEDULED",clients[2],techs[1],"03"),job("j4","Replace GFCI outlets","Electrical","COMPLETED",clients[3],techs[2],"01"),job("j5","Smart thermostat install","HVAC","COMPLETED",clients[0],techs[1],"30")];
jobs[0].voiceNotes=[{id:"v1",status:"COMPLETED",purpose:"INVOICE",transcript:"Arrived at Maria Alvarez's place on West Grace. AC wasn't cooling, bad run capacitor and the condenser fan motor was seized. Replaced the capacitor, forty-five over five, thirty-eight dollars, and a new fan motor two fourteen fifty. Two and a half hours labor at ninety-five an hour.",createdAt:"2026-10-01T16:30:00Z"}];
jobs[0].invoice=invoices[0];
const summary={totalRevenue:4820.5,outstandingBalance:1186.25,paidInvoiceCount:27,outstandingInvoiceCount:5,revenueByMonth:[],jobTypeBreakdown:[{jobType:"HVAC",count:41},{jobType:"Plumbing",count:23},{jobType:"Electrical",count:17}],busiestDays:[{day:"Monday",jobCount:9},{day:"Tuesday",jobCount:12},{day:"Wednesday",jobCount:14},{day:"Thursday",jobCount:11},{day:"Friday",jobCount:7},{day:"Saturday",jobCount:4}],jobStatusCounts:{scheduled:8,inProgress:3,completed:61,cancelled:2}};
const org={id:"o1",name:"Northside Heating & Air",taxRate:0.0725,timezone:"America/Chicago",stripeAccountId:"acct_demo",stripeChargesEnabled:true,stripePayoutsEnabled:true,stripeDetailsSubmitted:true,reviewRequestEnabled:true,reviewRequestDelayDays:2,reviewLinkUrl:null,rebookingRemindersEnabled:true,subscriptionStatus:"ACTIVE",trialEndsAt:null,subscriptionCurrentPeriodEnd:"2026-11-01T00:00:00Z"};
const pg=(data)=>({data,pagination:{page:1,pageSize:20,total:data.length,totalPages:1}});
const pub={invoiceNumber:"INV-000014",status:"SENT",createdAt:"2026-09-28T14:00:00Z",dueDate:"2026-10-15T00:00:00Z",organizationName:org.name,clientName:"Maria Alvarez",lineItems:items1,subtotal:invoices[0].subtotal,tax:invoices[0].tax,total:invoices[0].total,notes:"Thank you for your business!",paymentUrl:"https://checkout.stripe.com/demo"};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport:{width:1440,height:900}, deviceScaleFactor:2 });
const page = await ctx.newPage();
await page.route("**/localhost:4000/api/**", async (route)=>{
  const u = new URL(route.request().url()); const p = u.pathname.replace(/^\/api/,"");
  let body;
  if (p==="/reports/summary") body=summary;
  else if (p==="/jobs") body=pg(jobs);
  else if (/^\/jobs\/[^/]+\/documentation$/.test(p)) body=[];
  else if (/^\/jobs\//.test(p)) body=jobs.find(j=>p.endsWith(j.id))||jobs[0];
  else if (p==="/clients") body=pg(clients);
  else if (p==="/invoices") body=pg(invoices);
  else if (/^\/invoices\//.test(p)) body=invoices.find(i=>p.endsWith(i.id))||invoices[0];
  else if (p==="/users") body=techs;
  else if (p==="/organizations/me") body=org;
  else if (p==="/quotes") body=pg([]);
  else if (/^\/public\/invoices\//.test(p)) body=pub;
  else body={};
  await route.fulfill({status:200,contentType:"application/json",headers:{"access-control-allow-origin":"*"},body:JSON.stringify(body)});
});
const shot=async(name)=>{await page.waitForTimeout(700);await page.screenshot({path:`${out}/${name}.png`});console.log("saved",name)};
await page.goto("http://localhost:5173/login"); await shot("jobscribe-login");
await page.goto("http://localhost:5173/pay/demo-token"); await shot("jobscribe-client-invoice");
await page.evaluate(()=>{localStorage.setItem("token","demo");localStorage.setItem("user",JSON.stringify({id:"u1",name:"Baraa Eldeirawi",email:"owner@demo.example",role:"OWNER",organizationId:"o1"}))});
for (const [path,name] of [["/","jobscribe-dashboard"],["/jobs","jobscribe-jobs"],["/jobs/j1","jobscribe-job-detail"],["/invoices","jobscribe-invoices"],["/invoices/i1","jobscribe-invoice-detail"],["/clients","jobscribe-clients"],["/team","jobscribe-team"]]) { await page.goto("http://localhost:5173"+path); await shot(name); }
await browser.close();
