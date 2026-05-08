const prisma = require("../../config/prisma");
const { convToBiz } = require("../call/stream.handler");

exports.checkAvailability = async (req, res) => {
  try {
    let businessId = req.query.businessId || req.body.businessId;
    
    // 🔍 MULTI-TENANT AUTO-RESOLVE
    const convId = req.body.conversation_id || req.headers['x-elevenlabs-conversation-id'] || req.headers['x-conversation-id'];
    if (!businessId && convId) {
      businessId = convToBiz.get(convId);
      console.log(`[Webhook] Auto-resolved businessId ${businessId} from conversation ${convId}`);
    }

    if (!businessId) {
      return res.status(400).json({ error: "Missing businessId and could not auto-resolve from conversation_id" });
    }

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      include: {
        appointments: {
          where: { 
            appointmentTime: { gte: new Date() },
            status: { not: "CANCELLED" }
          },
          orderBy: { appointmentTime: "asc" }
        }
      }
    });

    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }

    const bizTimezone = business.timezone || "UTC";

    // Format appointments for the ElevenLabs AI
    const bookedSlots = business.appointments.map(a => {
      const d = new Date(a.appointmentTime);
      return new Intl.DateTimeFormat('en-US', { 
        weekday: 'short', month: 'short', day: 'numeric', 
        hour: '2-digit', minute: '2-digit', 
        timeZone: bizTimezone 
      }).format(d);
    });

    const response = {
      message: "Here are the currently booked and unavailable slots.",
      businessTimezone: bizTimezone,
      openTime: business.openTime,
      closeTime: business.closeTime,
      bookedSlots: bookedSlots.length > 0 ? bookedSlots : ["No appointments booked yet. All slots within business hours are open."]
    };

    return res.json(response);
  } catch (error) {
    console.error("[ElevenLabs Webhook] Error in checkAvailability:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

exports.bookAppointment = async (req, res) => {
  try {
    let businessId = req.query.businessId || req.body.businessId;
    
    // 🔍 MULTI-TENANT AUTO-RESOLVE
    const convId = req.body.conversation_id || req.headers['x-elevenlabs-conversation-id'] || req.headers['x-conversation-id'];
    if (!businessId && convId) {
      businessId = convToBiz.get(convId);
      console.log(`[Webhook] Auto-resolved businessId ${businessId} from conversation ${convId}`);
    }

    if (!businessId) {
      return res.status(400).json({ error: "Missing businessId and could not auto-resolve from conversation_id" });
    }

    const body = req.body || {};
    const customerName = body.customerName || body.name || body.customer_name;
    const customerPhone = body.customerPhone || body.phone || body.customer_phone;
    const serviceName = body.serviceName || body.service || body.service_name;
    const date = body.date;
    const time = body.time;

    if (!customerName || !date || !time) {
      return res.status(400).json({ error: "Missing required fields (customerName, date, time)" });
    }

    const business = await prisma.business.findUnique({
      where: { id: businessId }
    });

    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }

    const tz = business.timezone || "UTC";
    
    // Improved Date/Time parsing
    // Try to construct a valid ISO string. date should be YYYY-MM-DD, time should be HH:mm
    let appointmentTime;
    try {
      // Normalize date and time strings (remove any 'tomorrow', 'today' etc logic here if ElevenLabs sends relative text)
      // But ElevenLabs usually sends structured strings if configured as parameters.
      const normalizedDate = date.includes('T') ? date.split('T')[0] : date;
      const normalizedTime = time.includes(':') ? time : `${time}:00`;
      
      appointmentTime = new Date(`${normalizedDate}T${normalizedTime}`);
      
      if (isNaN(appointmentTime.getTime())) {
        // Try simple concatenation if ISO fails
        appointmentTime = new Date(date + ' ' + time);
      }
    } catch (e) {
      return res.status(400).json({ error: "Could not parse date and time. Please use YYYY-MM-DD and HH:mm." });
    }

    if (isNaN(appointmentTime.getTime())) {
      return res.status(400).json({ error: "Invalid date or time format." });
    }

    // Check for exact overlap
    const existing = await prisma.appointment.findFirst({
      where: { 
        businessId, 
        appointmentTime: appointmentTime, 
        status: { not: "CANCELLED" } 
      }
    });

    if (existing) {
      return res.status(409).json({ 
        success: false, 
        message: "This exact time slot is already booked. Please suggest another time." 
      });
    }

    const createdAppt = await prisma.appointment.create({
      data: {
        customerName,
        customerPhone: customerPhone || "Voice Caller",
        serviceName: serviceName || "General Service",
        appointmentTime: appointmentTime,
        businessId: business.id,
        tenantId: business.tenantId,
      }
    });

    const io = req.app.get("io");
    if (io) {
      console.log(`[Socket] Emitting new_appointment to business room: ${businessId}`);
      io.to(businessId).emit("new_appointment", createdAppt);
    }

    return res.json({ 
      success: true, 
      message: `Appointment successfully booked for ${customerName} on ${date} at ${time}.`
    });

  } catch (error) {
    console.error("[ElevenLabs Webhook] Error in bookAppointment:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

exports.postCallWebhook = async (req, res) => {
  try {
    const clientData = req.body.conversation_initiation_client_data || {};
    const businessId = req.query.businessId || req.body.businessId || clientData.businessId;
    
    if (!businessId) return res.status(400).json({ error: "Missing businessId" });

    const { agent_id, conversation_id, transcript, duration_secs } = req.body;

    const business = await prisma.business.findUnique({
      where: { id: businessId }
    });

    if (!business) return res.status(404).json({ error: "Business not found" });

    let formattedTranscript = "";
    if (Array.isArray(transcript)) {
      formattedTranscript = transcript.map(t => `${t.role.toUpperCase()}: ${t.message}`).join("\n");
    } else {
      formattedTranscript = typeof transcript === 'string' ? transcript : JSON.stringify(transcript);
    }

    await prisma.call.create({
      data: {
        tenantId: business.tenantId,
        businessId: business.id,
        fromNumber: "ElevenLabs AI",
        toNumber: business.phoneNumber || "Unknown",
        duration: duration_secs || 0,
        transcript: formattedTranscript || "Transcript not provided",
        customerName: "ElevenLabs Caller",
        summary: `ElevenLabs Agent Call (${conversation_id})`,
        cost: 0,
        tokensUsed: 0
      }
    });

    return res.status(200).send("OK");
  } catch (error) {
    console.error("[ElevenLabs Post-Call Webhook] Error:", error);
    return res.status(500).send("Internal Server Error");
  }
};
