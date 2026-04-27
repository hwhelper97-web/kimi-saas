const prisma = require("../config/prisma");

async function seed(){

console.log("Starting test data seed...");

/* =====================================
   FIND OWNER
===================================== */

const owner = await prisma.user.findFirst({
where:{ email:"Mustafa@owner.com" }
});

if(!owner){
console.log("Owner not found");
return;
}

const tenantId = owner.tenantId;


/* =====================================
   FIND BUSINESS
===================================== */

const business = await prisma.business.findFirst({
where:{ tenantId }
});

if(!business){
console.log("Business not found for this tenant");
return;
}

console.log("Business found:", business.name);


/* =====================================
   CREATE MENU ITEMS
===================================== */

const menuItems = [];

for(let i=1;i<=5;i++){

const item = await prisma.menuItem.create({
data:{
name:`Test Pizza ${i}`,
price:10 + i,
businessId:business.id
}
});

menuItems.push(item);

}

console.log("Menu items created");


/* =====================================
   CREATE CALLS
===================================== */

const calls = [];

for(let i=1;i<=20;i++){

const call = await prisma.call.create({
data:{
tenantId:tenantId,
businessId:business.id,

fromNumber:`+121255500${i}`,
toNumber: business.phoneNumber || "+12125559999",

duration:Math.floor(Math.random()*120)+30,
tokensUsed:Math.floor(Math.random()*800)+200,

transcript:`Customer ordered pizza test call ${i}`
}
});

calls.push(call);

}

console.log("Calls created");


/* =====================================
   CREATE ORDERS
===================================== */

for(let i=1;i<=12;i++){

const randomCall = calls[Math.floor(Math.random()*calls.length)];

const order = await prisma.order.create({
data:{
tenantId:tenantId,
businessId:business.id,
callId:randomCall.id,
total:0
}
});

let orderTotal = 0;

const itemCount = Math.floor(Math.random()*3)+1;

for(let j=0;j<itemCount;j++){

const menuItem = menuItems[Math.floor(Math.random()*menuItems.length)];

const qty = Math.floor(Math.random()*2)+1;

await prisma.orderItem.create({
data:{
orderId:order.id,
menuItemId:menuItem.id,
quantity:qty
}
});

orderTotal += menuItem.price * qty;

}

await prisma.order.update({
where:{ id:order.id },
data:{ total:orderTotal }
});

}

console.log("Orders created");

console.log("Seed completed successfully");

}

seed()
.then(()=>process.exit())
.catch(err=>{
console.error(err);
process.exit(1);
});