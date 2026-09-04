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
    }
  ],

  // 🏢 PROFESSIONAL SERVICES
  "Visa & Immigration Consultant": [
    {
      name: "Immigration Advisory",
      services: [
        { name: "Initial Visa Consultation", duration: 45, price: 100 },
        { name: "Document Review Session", duration: 60, price: 150 },
        { name: "PR Eligibility Assessment", duration: 60, price: 120 },
        { name: "Student Visa Guidance", duration: 45, price: 80 }
      ]
    }
  ],
  "Tax Consultant": [
    {
      name: "Tax Advisory",
      services: [
        { name: "Personal Tax Return Consultation", duration: 45, price: 90 },
        { name: "Corporate Tax Planning", duration: 60, price: 200 },
        { name: "Audit Defense Review", duration: 60, price: 250 },
        { name: "Sales Tax Compliance Audit", duration: 45, price: 150 }
      ]
    }
  ],
  "Financial Advisor": [
    {
      name: "Wealth Planning",
      services: [
        { name: "Wealth Management Consultation", duration: 60, price: 150 },
        { name: "Retirement Planning Session", duration: 60, price: 180 },
        { name: "Investment Portfolio Audit", duration: 45, price: 120 }
      ]
    }
  ],
  "Lawyer / Legal Consultant": [
    {
      name: "Legal Advisory",
      services: [
        { name: "Initial Legal Consultation", duration: 45, price: 150 },
        { name: "Contract Review Session", duration: 60, price: 200 },
        { name: "Business Incorporation Advice", duration: 60, price: 250 },
        { name: "Property Legal Opinion", duration: 45, price: 180 }
      ]
    }
  ],
  "Real Estate Consultant": [
    {
      name: "Real Estate Advisory",
      services: [
        { name: "Property Buying Advisory", duration: 45, price: 100 },
        { name: "Commercial Leasing Consultation", duration: 60, price: 150 },
        { name: "Property Valuation Assessment", duration: 45, price: 120 }
      ]
    }
  ],

  // 🩺 HEALTHCARE
  "Doctor's Clinic": [
    {
      name: "Medical Consultation",
      services: [
        { name: "General Medical Consultation", duration: 20, price: 50 },
        { name: "Follow-up Consultation", duration: 15, price: 30 },
        { name: "Full Health Screening", duration: 45, price: 100 }
      ]
    }
  ],
  "Dentist": [
    {
      name: "Dental Care",
      services: [
        { name: "Dental Checkup & Cleaning", duration: 30, price: 60 },
        { name: "Teeth Whitening Session", duration: 60, price: 200 },
        { name: "Tooth Filling Session", duration: 45, price: 90 },
        { name: "Extraction Consultation", duration: 30, price: 80 }
      ]
    }
  ],
  "Dermatologist": [
    {
      name: "Skin Care Therapy",
      services: [
        { name: "Acne & Skin Consultation", duration: 30, price: 80 },
        { name: "Chemical Peel Treatment", duration: 45, price: 120 },
        { name: "Laser Hair Removal Session", duration: 45, price: 150 }
      ]
    }
  ],

  // 📸 CREATIVE & SPECIALIZED
  "Photography Studio": [
    {
      name: "Photography Sessions",
      services: [
        { name: "Portrait Session", duration: 60, price: 150 },
        { name: "Corporate Headshots", duration: 45, price: 120 },
        { name: "Commercial Product Shoot", duration: 120, price: 350 }
      ]
    }
  ],
  "Car Detailing": [
    {
      name: "Auto Care",
      services: [
        { name: "Full Interior Deep Clean", duration: 90, price: 120 },
        { name: "Exterior Polish & Hand Wash", duration: 60, price: 80 },
        { name: "Ceramic Coating Application", duration: 180, price: 450 }
      ]
    }
  ]
};

// Map similar business types to existing structures
const TYPE_MAPPING = {
  "hair salon / barber": "Barber Shop",
  "beauty salon": "Salon",
  "makeup artist": "Salon",
  "nail technician": "Nail Studio",
  "tattoo artist": "Salon",
  "massage therapist": "Spa",
  "personal trainer": "Spa",
  "photographer": "Photography Studio",
  "personal stylist": "Salon",
  "physiotherapist": "Doctor's Clinic",
  "psychologist": "Doctor's Clinic",
  "nutritionist": "Doctor's Clinic",
  "eye specialist": "Doctor's Clinic",
  "chiropractor": "Doctor's Clinic",
  "accountant": "Tax Consultant",
  "business consultant": "Visa & Immigration Consultant",
  "insurance agent": "Financial Advisor",
  "travel consultant": "Visa & Immigration Consultant",
  "career counselor": "Visa & Immigration Consultant",
  "video production studio": "Photography Studio",
  "wedding planner": "Photography Studio",
  "interior designer": "Real Estate Consultant",
  "graphic designer": "Photography Studio",
  "tailor / bespoke clothing": "Salon",
  "home inspection": "Real Estate Consultant"
};

/**
 * Seeds default services for a business if they don't have any yet.
 */
async function seedDefaultServices(businessId, tenantId, businessType) {
  try {
    const existingCount = await prisma.appointmentService.count({ where: { businessId } });
    if (existingCount > 0) return { success: true, message: "Services already exist" };

    const normalizedType = (businessType || "").toLowerCase();
    
    let lookupType = businessType;
    for (const [key, val] of Object.entries(TYPE_MAPPING)) {
      if (key.toLowerCase() === normalizedType) {
        lookupType = val;
        break;
      }
    }
    
    let structureKey = Object.keys(DEFAULT_STRUCTURES).find(k => k.toLowerCase() === lookupType.toLowerCase());
    
    if (!structureKey) {
      structureKey = "Visa & Immigration Consultant"; // Generic professional service fallback
    }

    const structure = DEFAULT_STRUCTURES[structureKey] || DEFAULT_STRUCTURES["Salon"];

    console.log(`[Seeder] Seeding defaults for ${businessType} using template ${structureKey} (${businessId})...`);

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
