const prisma = require("../config/prisma");

const DEFAULT_STRUCTURES = {
  "Salon": [
    {
      name: "Hair Services",
      services: [
        { name: "Hair Cut", duration: 30, price: 25 },
        { name: "Hair Styling", duration: 45, price: 40 },
        { name: "Hair Coloring", duration: 90, price: 80 },
        { name: "Hair Treatment", duration: 60, price: 50 },
        { name: "Hair Wash", duration: 15, price: 10 },
        { name: "Blow Dry", duration: 30, price: 20 },
        { name: "Keratin Treatment", duration: 120, price: 150 }
      ]
    },
    {
      name: "Facial Services",
      services: [
        { name: "Basic Facial", duration: 45, price: 50 },
        { name: "Gold Facial", duration: 60, price: 80 },
        { name: "Hydrating Facial", duration: 60, price: 70 },
        { name: "Anti-Aging Facial", duration: 75, price: 90 }
      ]
    },
    {
      name: "Makeup Services",
      services: [
        { name: "Bridal Makeup", duration: 120, price: 250 },
        { name: "Party Makeup", duration: 60, price: 100 },
        { name: "Casual Makeup", duration: 45, price: 60 }
      ]
    }
  ],
  "Barber Shop": [
    {
      name: "Haircut Services",
      services: [
        { name: "Classic Haircut", duration: 30, price: 20 },
        { name: "Fade Cut", duration: 45, price: 25 },
        { name: "Buzz Cut", duration: 20, price: 15 },
        { name: "Kids Haircut", duration: 25, price: 15 }
      ]
    },
    {
      name: "Beard Services",
      services: [
        { name: "Beard Trim", duration: 15, price: 10 },
        { name: "Beard Styling", duration: 20, price: 15 },
        { name: "Hot Towel Shave", duration: 30, price: 20 }
      ]
    },
    {
      name: "Premium Grooming",
      services: [
        { name: "Hair + Beard Combo", duration: 60, price: 40 },
        { name: "Face Cleanup", duration: 30, price: 25 }
      ]
    }
  ],
  "Spa": [
    {
      name: "Massage Therapy",
      services: [
        { name: "Swedish Massage", duration: 60, price: 80 },
        { name: "Deep Tissue Massage", duration: 60, price: 100 },
        { name: "Hot Stone Massage", duration: 90, price: 130 },
        { name: "Aromatherapy Massage", duration: 60, price: 110 }
      ]
    },
    {
      name: "Relaxation Services",
      services: [
        { name: "Steam Bath", duration: 30, price: 30 },
        { name: "Jacuzzi Session", duration: 45, price: 50 },
        { name: "Sauna Therapy", duration: 30, price: 35 }
      ]
    },
    {
      name: "Skin Therapy",
      services: [
        { name: "Body Scrub", duration: 45, price: 60 },
        { name: "Skin Detox", duration: 60, price: 85 },
        { name: "Body Polish", duration: 60, price: 95 }
      ]
    }
  ],
  "Nail Studio": [
    {
      name: "Nail Care",
      services: [
        { name: "Manicure", duration: 30, price: 25 },
        { name: "Pedicure", duration: 45, price: 35 },
        { name: "Gel Nails", duration: 60, price: 50 },
        { name: "Acrylic Nails", duration: 90, price: 70 }
      ]
    },
    {
      name: "Nail Art",
      services: [
        { name: "Custom Nail Art", duration: 30, price: 20 },
        { name: "French Tips", duration: 20, price: 15 },
        { name: "Glitter Nails", duration: 15, price: 10 }
      ]
    }
  ]
};

// Map similar business types to existing structures
const TYPE_MAPPING = {
  "Hair Studio": "Salon",
  "Beauty Clinic": "Salon",
  "Massage Center": "Spa",
  "Wellness Center": "Spa"
};

/**
 * Seeds default services for a business if they don't have any yet.
 */
async function seedDefaultServices(businessId, tenantId, businessType) {
  try {
    // 1. Check if business already has services
    const existingCount = await prisma.appointmentService.count({ where: { businessId } });
    if (existingCount > 0) return { success: true, message: "Services already exist" };

    // 2. Resolve structure (Case-insensitive)
    const normalizedType = businessType.toLowerCase();
    
    // Check mapping first
    let lookupType = businessType;
    for (const [key, val] of Object.entries(TYPE_MAPPING)) {
      if (key.toLowerCase() === normalizedType) {
        lookupType = val;
        break;
      }
    }
    
    // Find in structures
    let structureKey = Object.keys(DEFAULT_STRUCTURES).find(k => k.toLowerCase() === lookupType.toLowerCase());
    
    // Fallback for generic 'appointment' type
    if (!structureKey && normalizedType === "appointment") {
      structureKey = "Salon";
    }

    const structure = structureKey ? DEFAULT_STRUCTURES[structureKey] : null;

    if (!structure) {
      console.warn(`[Seeder] No default structure for business type: ${businessType}`);
      return { success: false, message: "No structure found" };
    }

    console.log(`[Seeder] Seeding defaults for ${businessType} (${businessId})...`);

    // 3. Create categories and services
    for (const catData of structure) {
      const category = await prisma.serviceCategory.create({
        data: {
          name: catData.name,
          businessId,
          tenantId,
          isActive: true
        }
      });

      for (const svc of catData.services) {
        await prisma.appointmentService.create({
          data: {
            name: svc.name,
            price: svc.price,
            duration: svc.duration,
            categoryId: category.id,
            businessId,
            tenantId,
            isAvailable: true,
            allowOnlineBooking: true
          }
        });
      }
    }

    return { success: true, message: "Seeding completed" };
  } catch (error) {
    console.error("[Seeder] Error seeding services:", error);
    return { success: false, error: error.message };
  }
}

module.exports = { seedDefaultServices };
