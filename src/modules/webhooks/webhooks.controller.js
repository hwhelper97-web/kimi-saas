const prisma = require("../../config/prisma");
const { convToBiz } = require("../call/stream.handler");

async function resolveBusinessId(req) {
  const query = req.query || {};
  const body = req.body || {};
  const params = body.parameters || {};
  
  let bId = params.businessId || body.businessId || query.businessId;
  const convId = body.conversation_id || 
                 req.headers['x-elevenlabs-conversation-id'] || 
                 req.headers['xi-conversation-id'] ||
                 req.headers['x-conversation-id'] ||
                 body.conversationId;

  if (bId && typeof bId === 'string' && !bId.includes("{") && !bId.includes("system")) return { businessId: bId, convId };

  console.log(`[V2_RESOLVE] Placeholder/Missing ID (${bId}) detected. Attempting fallbacks...`);

  if (convId) {
    const mappedId = convToBiz.get(convId);
    if (mappedId) {
      console.log(`[V2_RESOLVE] Handshake Match: ${convId} -> ${mappedId}`);
      return { businessId: mappedId, convId };
    }
  }

  const agentId = body.agent_id || query.agent_id;
  if (agentId) {
    const biz = await prisma.business.findFirst({
      where: { 
        OR: [
          { aiVoiceId: agentId },
          { aiVoiceId: `agent_${agentId}` },
          { aiVoiceId: agentId.replace("agent_", "") }
        ]
      }
    });
    if (biz) {
      console.log(`[V2_RESOLVE] Agent Signature Match: ${agentId} -> ${biz.id}`);
      return { businessId: biz.id, convId };
    }
  }

  const lastCall = await prisma.call.findFirst({
    where: { outcome: "active" },
    orderBy: { createdAt: "desc" },
    select: { businessId: true }
  });
  
  if (lastCall) {
    console.log(`[V2_RESOLVE] Temporal Fallback: Linking to active call for Business ${lastCall.businessId}`);
    return { businessId: lastCall.businessId, convId };
  }

  return { businessId: null, convId };
}

exports.checkAvailability = async (req, res) => {
  try {
    const { businessId, convId } = await resolveBusinessId(req);
    if (!businessId) {
      return res.status(200).json({ status: "error", message: "Business not resolved" });
    }

    const business = await prisma.business.findUnique({ where: { id: businessId } });
    if (!business) return res.status(404).json({ error: "Business not found" });

    const { getSlotsForDate } = require("../../services/slot.service");
    const { getBusinessDates } = require("../../services/date.service");
    const { todayStr, tomorrowStr } = getBusinessDates(business.timezone || "UTC");

    const [todaySlots, tomorrowSlots, allServices] = await Promise.all([
      getSlotsForDate(business.tenantId, business.id, todayStr),
      getSlotsForDate(business.tenantId, business.id, tomorrowStr),
      prisma.appointmentService.findMany({ where: { businessId: business.id, isActive: true } })
    ]);

    const formatAvail = (slots) => (slots || []).filter(s => s.status === 'available').slice(0, 10).map(s => s.time).join(", ");
    
    return res.json({
      status: "success",
      business_name: business.name,
      service_menu: allServices.map(s => `${s.name} ($${s.price})`).join(", "),
      available_slots: `Today: ${formatAvail(todaySlots) || "Fully booked"}. Tomorrow: ${formatAvail(tomorrowSlots) || "Slots available."}`
    });
  } catch (err) {
    console.error("Check Availability Error:", err);
    res.status(500).json({ error: "Internal Error" });
  }
};

exports.bookAppointment = async (req, res) => {
  try {
    const { businessId, convId } = await resolveBusinessId(req);
    if (!businessId) {
      return res.status(200).json({ status: "error", message: "Business not resolved" });
    }

    const body = req.body || {};
    const params = body.parameters || body; // ElevenLabs sometimes flattens
    
    const customerName = params.customerName || params.name;
    const serviceId = params.serviceId || params.service;
    const date = params.date;
    const time = params.time;

    if (!customerName || !date || !time) {
      return res.status(200).json({ status: "error", message: "Missing required fields (name, date, time)" });
    }

    const business = await prisma.business.findUnique({ where: { id: businessId } });
    
    // Resolve Service if ID is missing or "haircut" (string search)
    let finalServiceId = serviceId;
    if (!finalServiceId || finalServiceId.length < 10) {
      const firstService = await prisma.appointmentService.findFirst({
        where: { businessId, name: { contains: "hair", mode: 'insensitive' } }
      });
      if (firstService) finalServiceId = firstService.id;
    }

    // Default service fallback
    if (!finalServiceId) {
      const defService = await prisma.appointmentService.findFirst({ where: { businessId } });
      finalServiceId = defService?.id;
    }

    let apptTime = new Date(`${date}T${time}:00`);
    
    // 🛡️ YEAR ENFORCEMENT: AI sometimes hallucinations 2023/2024.
    // If the year is not 2026, we force it to 2026 to ensure visibility in the dashboard.
    const currentYear = 2026;
    if (apptTime.getFullYear() !== currentYear) {
      console.log(`[V2_YEAR_FIX] AI hallucinated ${apptTime.getFullYear()}. Forcing to ${currentYear}.`);
      apptTime.setFullYear(currentYear);
    }
    
    const createdAppt = await prisma.appointment.create({
      data: {
        businessId,
        tenantId: business.tenantId,
        customerName,
        customerPhone: params.customerPhone || "Voice Call",
        serviceId: finalServiceId,
        appointmentTime: apptTime,
        appointmentEnd: new Date(apptTime.getTime() + 30 * 60000), // Default 30m
        durationMinutes: 30,
        status: "CONFIRMED",
        source: "AI"
      },
      include: { service: true }
    });

    // 🚀 Update Call Status for Analytics
    await prisma.call.updateMany({
      where: { businessId, outcome: "active" },
      data: { outcome: "success", actionTaken: `Booked ${createdAppt.service?.name || 'Appointment'}` }
    });

    // Notify Dashboard
    const io = req.app.get("io");
    if (io) {
      console.log(`[Socket] Emitting new_appointment for business ${businessId} and tenant ${business.tenantId}`);
      io.to(businessId).emit("new_appointment", createdAppt);
      io.to(`tenant_${business.tenantId}`).emit("new_appointment", createdAppt);
      io.to("superadmin").emit("new_appointment", createdAppt);
    }

    return res.json({
      status: "success",
      message: "Appointment booked successfully!",
      appointment_details: `Confirmed ${createdAppt.service?.name} for ${customerName} at ${time} on ${date}.`
    });
  } catch (err) {
    console.error("Booking Error:", err);
    res.status(500).json({ error: "Internal Error" });
  }
};

exports.createOrder = async (req, res) => {
  try {
    const { businessId, convId } = await resolveBusinessId(req);
    if (!businessId) {
      return res.status(200).json({ status: "error", message: "Business not resolved" });
    }

    const body = req.body || {};
    const params = body.parameters || body;
    const customerName = params.customerName || "Voice Guest";
    const items = params.items || [];
    const notes = params.notes || "";

    const business = await prisma.business.findUnique({ where: { id: businessId } });
    if (!business) return res.status(404).json({ error: "Business not found" });

    let total = 0;
    const orderItems = [];

    // 1. Process Items
    if (items && Array.isArray(items)) {
      for (const item of items) {
        const menuItem = await prisma.menuItem.findFirst({
          where: { 
            OR: [
              { id: item.id || "" },
              { name: { contains: item.name || "", mode: 'insensitive' } }
            ],
            businessId
          }
        });
        if (menuItem) {
          const qty = parseInt(item.quantity) || 1;
          const price = menuItem.price * qty;
          total += price;
          orderItems.push({
            menuItemId: menuItem.id,
            quantity: qty,
            unitPrice: menuItem.price,
            tenantId: business.tenantId
          });
        }
      }
    }

    // 2. Add Tax
    if (business.taxRate) {
      total = total * (1 + (business.taxRate / 100));
    }

    // 3. Save Order
    const order = await prisma.order.create({
      data: {
        businessId,
        tenantId: business.tenantId,
        customerName,
        total,
        notes,
        status: "pending",
        source: "AI",
        items: {
          create: orderItems
        }
      },
      include: {
        items: { include: { menuItem: true } }
      }
    });

    // 4. Generate Display ID
    const displayId = `#A${String(order.orderNumber).padStart(3, '0')}`;
    const finalOrder = { ...order, displayId };

    // 🚀 Update Call Status
    await prisma.call.updateMany({
      where: { businessId, outcome: "active" },
      data: { outcome: "success", actionTaken: `Placed Order ${displayId}` }
    });

    // 5. Notify Dashboard
    const io = req.app.get("io");
    if (io) {
      io.to(businessId).emit("new_order", finalOrder);
      io.to(`tenant_${business.tenantId}`).emit("new_order", finalOrder);
      io.to("superadmin").emit("new_order", finalOrder);
    }

    return res.json({
      status: "success",
      message: "Order placed successfully",
      order_details: `Order ${displayId} confirmed for ${customerName}. Total: $${total.toFixed(2)}`
    });
  } catch (err) {
    console.error("Order Webhook Error:", err);
    res.status(500).json({ error: "Internal Error" });
  }
};

exports.postCallWebhook = async (req, res) => {
  res.json({ status: "success" });
};
