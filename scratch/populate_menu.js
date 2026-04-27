const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const BUSINESS_ID = "11af1858-dd05-44d2-952e-7048ccbb1a1e";
const TENANT_ID = "117925c8-50dc-42a8-9c64-a9190e62db1d";

const menuData = [
  {
    category: "BIRRIA",
    items: [
      { name: "Chicken Flautas", price: 14.99, description: "3 Taquito Topped With Lettuce Sour Cream Cotija Cheese Tomato Side Rice Beans" },
      { name: "Potato Flautas", price: 13.99, description: "3 Taquitos Topped With Sour Cream Lettuce Cotija Cheese Tomato With A Side Of Rice And Beans" },
      { name: "Steak Fries", price: 14.50, description: "Fries Topped With Beans Cheese Steak House Salsa Pico Degallo Guacamole & Sour Cream" },
      { name: "Chicken Fries", price: 14.50, description: "Fries Topped With Beans Cheese Grilled Chicken House Salsa Pico Degallo Guacamole & Sour Cream" },
      { name: "Super Nachos", price: 14.50, description: "Chips Topped With Beans Cheese Meat House Salsa Pico De Gallo Guacamole & Sour Cream" },
      { name: "Regular Bowl", price: 11.99, description: "Rice beans choice of meat pico de gallo house salsa & Lettuce" },
      { name: "Nacho Cheese Fries", price: 15.99, description: "Fries Topped With Beans Shredded Cheese Nacho Cheese Meat Onions Cilanto & Sour Cream" }
    ]
  },
  {
    category: "BURRITO",
    items: [
      { name: "Bean & Cheese Burrito", price: 6.50, description: "Only Cheese & Refried Beans" },
      { name: "Bean, Cheese, Rice Burrito", price: 7.50, description: "Only Rice Refried Beans & Cheese" },
      { name: "Regular Burrito", price: 11.99, description: "Rice beans Meat Pico De Gallo House Salsa" },
      { name: "Super Burrito", price: 13.99, description: "Rice beans Meat Pico De Gallo house salsa Sour cream & cheese" },
      { name: "Super Fish Burrito", price: 15.50, description: "Rice beans Fish Pico Degallo house salsa Sour cream & Cheese" },
      { name: "Super Shrimp Burrito", price: 15.50, description: "Rice beans Shrimo Pico De Gallo house salsa Sour cream & cheese" },
      { name: "Fajita Burrito", price: 15.50, description: "Rice beans Meat Pico Degallo house salsa Sour grilled bell pepper and onions Sour Cream & Cheese" },
      { name: "Wet Burrito", price: 16.99, description: "Choice Of Meat Rice Beans Smothered in red enchilada salsa Topped With Melted Cheese. Sour Cream And Pico On The Side" },
      { name: "Cali Burrito", price: 15.99, description: "Fries Meat Pico Degallo house salsa Sour cream & Cheese" },
      { name: "Lady Boss", price: 15.99, description: "Our most popular burrito Rice beans Meat grilled onions fresh onions cilantro house salsa Sour cream & cheese" },
      { name: "Surf N Turf Burrito", price: 17.99, description: "Rice beans steak and shrimp pico de gallo house salsa Sour cream and cheese" },
      { name: "Vegan Burrito", price: 11.99, description: "Rice beans grilled bell pepper and onions pico de gallo house salsa guacamole" },
      { name: "Cheeto Burrito", price: 15.99, description: "" },
      { name: "Veggie Burrito", price: 12.99, description: "Rice beans grilled bell pepper and onions pico de gallo house salsa Sour cream and cheese guacamole" },
      { name: "Wet Burrito VEGGIE", price: 14.99, description: "Rice beans grilled bell pepper and onions smothered in red enchilada salsa With Melted Cheese On Top With Side Sour Cream & Pico" },
      { name: "Wet Lady boss Burrito", price: 17.99, description: "Rice beans choice of meat grilled onions fresh onions cilantro house salsa Sour cream and cheese smothered in our red enchilada salsa" },
      { name: "WET CALI BURRITO", price: 17.99, description: "Fries Meat smothered in our red enchilada salsa Topped With Melted Cheese. Pico Degallo & Sour Cream Side" },
      { name: "CALI VEGGIE", price: 14.99, description: "Fries beans grilled bell pepper and onions pico de gallo house salsa Sour cream & cheese" },
      { name: "Breakfast Burrito", price: 15.75, description: "Fries Meat Eggs Grilled Onion House Salsa Sour Cream & Cheese" },
      { name: "Breakfast VEGGIE BURRITO", price: 14.99, description: "Fries Eggs grilled bell pepper & Onions House Salsa Sour Cream & Cheese" }
    ]
  },
  {
    category: "BOWL",
    items: [
      { name: "Regular Bowl", price: 11.99, description: "Rice beans choice of meat pico de gallo house salsa & Lettuce" },
      { name: "Super Bowl", price: 13.99, description: "Rice beans Meat pico de gallo house salsa Sour cream and cheese & Lettuce" },
      { name: "Veggie Bowl", price: 11.99, description: "Rice beans grilled bell pepper & Onions pico de gallo Guacamole house salsa Sour cream cheese & Lettuce" },
      { name: "Vegan Bowl", price: 11.99, description: "Rice beans grilled bell pepper & onions pico de gallo Guacamole house salsa & Lettuce" },
      { name: "Super Bowl Shrimp", price: 15.50, description: "Rice beans shrimp pico de gallo house salsa Sour cream and cheese lettuce" },
      { name: "Super Fajita Bowl", price: 15.50, description: "Rice beans choice of meat grilled bell peppers and onions pico de gallo house salsa Sour cream and cheese lettuce" },
      { name: "Wet Bowl", price: 16.99, description: "Rice beans choice of meat pico de gallo house salsa Sour cream and cheese lettuce red enchilada salsa" },
      { name: "Cali Bowl", price: 15.99, description: "Fries choice of meat pico de gallo house salsa Sour cream and cheese lettuce" },
      { name: "Cheeto Bowl", price: 15.99, description: "Rice beans choice of meat fresh onion cilantro nacho cheese Sour cream and cheese cheetos" },
      { name: "Lady Boss Bowl", price: 15.99, description: "Rice beans choice of meat grilled onions fresh onions cilantro house salsa Sour cream cheese lettuce" },
      { name: "Bowl/Surf N Turf", price: 17.99, description: "Rice beans shrimp and steak pico de gallo house salsa Sour cream cheese lettuce" },
      { name: "Breakfast Bowl", price: 15.75, description: "Fries choice of meat eggs cheese house salsa sour cream cheese" },
      { name: "BREAKFAST VEGGIE", price: 14.99, description: "" }
    ]
  },
  {
    category: "TACOS",
    items: [
      { name: "Regular Taco", price: 4.25, description: "1 Taco With Meat House Salsa Cilantro & Onions" },
      { name: "Regular Shrimp", price: 4.75, description: "1 Taco With Shrimp House Salsa Cilantro & Onions" },
      { name: "Regular Fish", price: 4.75, description: "1 Taco With Fish House Salsa Cilantro & Onions" },
      { name: "Vegan Taco", price: 4.99, description: "1 Taco With Rice Black Beans Grilled Bell Peppers & Onions House Salsa Guacamole Pico De Gallo & Cilantro" },
      { name: "Veggie Taco", price: 5.50, description: "1 Taco With Rice Black Beans Grilled Bell Peppers & Onions House Salsa Pico Degallo Guacamole Sour Cream Cheese & Cilantro" },
      { name: "Super Taco", price: 5.50, description: "1 Taco Meat Pico Degallo Guacamole House Salsa Sour Cream Cheese & Cilantro" }
    ]
  },
  {
    category: "PLATES",
    items: [
      { name: "Chicken Flautas", price: 14.99, description: "3 Taquito Topped With Lettuce Sour Cream Cotija Cheese Tomato Side Rice Beans" },
      { name: "Potato Flautas", price: 13.99, description: "3 Taquitos Topped With Sour Cream Lettuce Cotija Cheese Tomato With A Side Of Rice And Beans" },
      { name: "Ench\\Chicken", price: 15.99, description: "3 Enchilads Topped With Spicy Green Salsa Lettuce Sour Cream Cotija Cheese Tomato Side Rice Beans" },
      { name: "Ench\\Steak", price: 15.99, description: "3 Enchilads Topped With Spicy Green Salsa Lettuce Sour Cream Cotija Cheese Sour Cream Side Rice Beans" },
      { name: "Ench\\Shrimp", price: 16.99, description: "3 Enchiladas Topped With Spicy Green Salsa Lettuce Sour Cream Cotija Cheese Tomato Side Rice Beans" },
      { name: "Ench\\Ground Beef", price: 15.99, description: "3 Enchikads Topped Spicy Green Salsa Lettuce Sour Cream Cotija Cheese Tomato Side Rice Beans" },
      { name: "Fajita Plate", price: 16.99, description: "Meat Mixed With Bell Pepper & Onions Lettuce Pico Degallo Side Tortilla Rice & Beans" },
      { name: "CHEESE ENCHILADAS", price: 13.99, description: "3 Cheese Enchilads Topped With Spicy Green Salsa Lettuce Sour Cream Cotija Cheese Tomato Side Rice & Beans" }
    ]
  },
  {
    category: "NACHOS",
    items: [
      { name: "Steak Fries", price: 14.50, description: "Fries Topped With Beans Cheese Steak House Salsa Pico Degallo Guacamole & Sour Cream" },
      { name: "Chicken Fries", price: 14.50, description: "Fries Topped With Beans Cheese Grilled Chicken House Salsa Pico Degallo Guacamole & Sour Cream" },
      { name: "Super Nachos", price: 14.50, description: "Chips Topped With Beans Cheese Meat House Salsa Pico De Gallo Guacamole & Sour Cream" },
      { name: "Nacho Cheese Fries", price: 15.99, description: "Fries Topped With Beans Shredded Cheese Nacho Cheese Meat Onions Cilanto & Sour Cream" },
      { name: "Regular Nachos", price: 11.99, description: "Chips Topped With Beans Cheese Grilled Bell Pepper & Onions House Salsa Pico De Gallo Guacamole & Sour Cream" },
      { name: "Regular Nacho FRIES", price: 12.99, description: "Fries Topped With Beans Cheese Grilled Bell Pepper & Onions House Salsa Pico De Gallo Guacamole & Sour Cream" },
      { name: "Super Nachos Shrimp", price: 16.50, description: "Chips Topped With Beans Cheese Shrimp House Salss Pico De Gallo Guacamole & Sour Cream" },
      { name: "Shrimp Fries", price: 16.99, description: "Fries Topped With Beans Cheese Shrimp House Salsa Pico Degallo Guacamole & Sour Cream" },
      { name: "Nacho Cheese Chips", price: 15.99, description: "Chips Topped With Beans Cheese Meat Onions Cilantro & Sour Cream" },
      { name: "Chips & Nacho Cheese", price: 9.00, description: "Chips Topped With Nacho Cheese" },
      { name: "FRIES AND NACHO CHEESE", price: 9.00, description: "Fries Topped With Nacho Cheese" },
      { name: "Chips & SHREDDED CHEESE", price: 8.00, description: "Chips Topped With Shredded White Cheese" }
    ]
  },
  {
    category: "QUESADILLAS",
    items: [
      { name: "Regular Quesadilla", price: 6.50, description: "Tortilla With Cheese Side House Salsa" },
      { name: "Veggie Quesadilla", price: 11.99, description: "Tortilla With Cheese Grilled Bell Pepper & Onions Side Pico Degallo Guacamole & Sour Cream" },
      { name: "Super Quesadilla", price: 13.99, description: "Tortilla With Cheese Meat Side Pico De Gallo Guacamole House Salsa & Sour Cream" },
      { name: "Super Shrimp Quesadilla", price: 15.99, description: "Tortilla With Cheese Shrimp Side Pico De Gallo Guacamole House Salsa & Sour Cream" },
      { name: "Quesadilla Cheeto", price: 15.99, description: "Tortilla With Meat Nacho Cheese Shredded Cheese Grilled Onions Fresh Onions Cilantro Cheetos All Inside With A Side Sour Cream" }
    ]
  },
  {
    category: "VEGAN",
    items: [
      { name: "Vegan Burrito", price: 11.99, description: "Rice beans grilled bell pepper and onions pico de gallo house salsa guacamole" },
      { name: "Vegan Taco", price: 4.99, description: "1 Taco With Rice Black Beans Grilled Bell Peppers & Onions House Salsa Guacamole Pico De Gallo & Cilantro" },
      { name: "Vegan Flautas", price: 11.99, description: "3 Potato Taquito Topped With Lettuce Tomoto Side Rice Beans" }
    ]
  },
  {
    category: "TORTAS",
    items: [
      { name: "Torta", price: 13.99, description: "Fresh Bread With Mayonise Cheese Beans Meat Grilled Onions Lettuce Tomato" },
      { name: "Torta Veggie", price: 11.99, description: "Fresh Bread With Mayonise Cheese Beans Grilled Bell Pepper & Onions Lettuce Tomato" }
    ]
  },
  {
    category: "SIDES",
    items: [
      { name: "$2 Chips", price: 2.00, description: "" },
      { name: "$5 Chips", price: 5.00, description: "" },
      { name: "$3 Salsa Spicy", price: 3.00, description: "" },
      { name: "$5 Salsa Spicy", price: 5.00, description: "" },
      { name: "$3 Salsa Mild", price: 3.00, description: "" },
      { name: "$5 Salsa Mild", price: 5.00, description: "" },
      { name: "$1 Guac", price: 1.50, description: "" },
      { name: "$3 Guac", price: 3.00, description: "" },
      { name: "$5 Guac", price: 5.00, description: "" },
      { name: "$1 Pico", price: 1.00, description: "" },
      { name: "$3 Pico", price: 3.00, description: "" },
      { name: "$5 Pico", price: 5.00, description: "" },
      { name: "$1 Side SC", price: 1.00, description: "" },
      { name: "$3 Sour Cream", price: 3.00, description: "" },
      { name: "$3 Nacho Cheese", price: 3.00, description: "" },
      { name: "$5 Nacho Cheese", price: 5.00, description: "" },
      { name: "Side Jalapenos", price: 1.00, description: "" },
      { name: "Burrito TORTILLA (1)", price: 1.00, description: "" },
      { name: "Corn Tortilla (4)", price: 1.00, description: "" },
      { name: "40 Oz Bowl Spicy", price: 15.00, description: "" },
      { name: "40oz Bowl Mild", price: 15.00, description: "" },
      { name: "$3 Red Enchilada Salsa", price: 3.00, description: "" },
      { name: "$3 Green Enchilada Salsa", price: 3.00, description: "" },
      { name: "3 SMALL SALSAS", price: 1.00, description: "" }
    ]
  },
  {
    category: "FRESCAS",
    items: [
      { name: "Watermelon", price: 4.50, description: "Fresh Sweet Watermelon Drink" },
      { name: "Hamaika", price: 4.50, description: "Fresh Sweet Hibiscus Flower Drink" },
      { name: "Horchata", price: 4.50, description: "Fresh Made Sweet Cinnamon Rice Milk Drink" },
      { name: "Pineapple", price: 4.50, description: "Fresh Sweet Pineapple Drink" },
      { name: "Watermelon\\Pineapple", price: 4.50, description: "Fresh Mix Watermelon\\pineapple Drink" },
      { name: "Hamika\\Pineapple", price: 4.50, description: "Fresh Sweet Haimaika\\pineapple Drink" }
    ]
  },
  {
    category: "DRANKS",
    items: [
      { name: "Mexican Coke Bottle", price: 4.00, description: "Mexican Coke Bottle" },
      { name: "Coke Can", price: 2.00, description: "Coke Can" },
      { name: "Sprite Can", price: 2.00, description: "Sprite Can" },
      { name: "Diet Coke", price: 2.00, description: "Diet Coke" },
      { name: "Coke Zero Can", price: 2.00, description: "Coke Zero Can" },
      { name: "Mandarin Jarrito", price: 3.50, description: "" },
      { name: "Tamarind Jarrito", price: 3.50, description: "" },
      { name: "Fruit Punch Jarrito", price: 3.50, description: "" },
      { name: "Gatorade Blue", price: 3.50, description: "" },
      { name: "Gatorade Red", price: 3.50, description: "" }
    ]
  }
];

async function main() {
  console.log("Cleaning old menu items for Nexton Burger...");
  // Clear related items to avoid constraint errors
  await prisma.menuSize.deleteMany({ where: { tenantId: TENANT_ID } });
  await prisma.menuAddon.deleteMany({ where: { tenantId: TENANT_ID } });
  await prisma.menuOption.deleteMany({ where: { tenantId: TENANT_ID } });
  await prisma.orderItem.deleteMany({ where: { tenantId: TENANT_ID } });
  await prisma.menuItem.deleteMany({ where: { businessId: BUSINESS_ID } });
  await prisma.menuCategory.deleteMany({ where: { businessId: BUSINESS_ID } });

  for (const cat of menuData) {
    console.log(`Adding category: ${cat.category}`);
    const category = await prisma.menuCategory.create({
      data: {
        name: cat.category,
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID
      }
    });

    for (const item of cat.items) {
      await prisma.menuItem.create({
        data: {
          name: item.name,
          price: item.price,
          description: item.description,
          categoryId: category.id,
          businessId: BUSINESS_ID,
          tenantId: TENANT_ID
        }
      });
    }
  }
  console.log("Full Menu population complete!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
