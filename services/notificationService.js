// services/notificationService.js
const axios = require('axios');
const GowhatsConfig = require('../models/GowhatsConfig');
const Worker = require('../models/Worker');


const sendWhatsAppTemplateMessage = async (subdomain, templateName, recipientNumber, headerParams, bodyParams, footerText) => {
  try {
    const config = await GowhatsConfig.findOne({ subdomain });

    if (!config) {
      console.error(`[WhatsApp Error] GoWhats configuration not found for subdomain: ${subdomain}`);
      return { success: false, error: 'Configuration not found' };
    }

    const { apiKey, phoneNumberId } = config;
    const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;
    
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };

    const templateComponents = [];

    if (headerParams && headerParams.length > 0) {
      templateComponents.push({
        type: 'header',
        parameters: headerParams
      });
    }

    if (bodyParams && bodyParams.length > 0) {
      templateComponents.push({
        type: 'body',
        parameters: bodyParams
      });
    }

    const messageData = {
      messaging_product: 'whatsapp',
      to: recipientNumber,
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'en' }, 
        components: templateComponents
      }
    };

      console.log('[WhatsApp] Sending template message:', JSON.stringify(messageData, null, 2));

    const response = await axios.post(url, messageData, { headers });
    
    console.log(`[WhatsApp Success] Message sent successfully to ${recipientNumber}`);
    return { success: true, messageId: response.data.messages[0].id };

  } catch (error) {
    const errorMessage = error.response ? 
      error.response.data.error.message : 
      error.message;
    
    console.error(`[WhatsApp Error] Failed to send message:`, errorMessage);
    return { success: false, error: errorMessage };
  }
};

/**
 * Sends leave request notification to admin
 */
const sendNewLeaveRequestNotification = async (leave) => {
  try {
    const { subdomain, worker: workerId, leaveType, startDate, endDate, totalDays, reason } = leave;

    const config = await GowhatsConfig.findOne({ subdomain });
    if (!config || !config.adminWhatsappNumbers || config.adminWhatsappNumbers.length === 0) {
      console.error(`[WhatsApp Error] Admin WhatsApp numbers not configured for ${subdomain}`);
      return { success: false, error: 'Admin numbers not configured' };
    }

    const worker = await Worker.findById(workerId).select('name department');
    if (!worker) {
      console.error(`[WhatsApp Error] Worker not found with ID: ${workerId}`);
      return { success: false, error: 'Worker not found' };
    }

    const formatDate = (date) => {
      return new Date(date).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    };

    const bodyParameters = [
      { type: 'text', text: worker.name },
      { type: 'text', text: leaveType },
      { type: 'text', text: formatDate(startDate) },
      { type: 'text', text: formatDate(endDate) },
      { type: 'text', text: totalDays.toString() },
      { type: 'text', text: reason }
    ];

    // Send to all admin numbers
    const results = [];
    for (const adminNumber of config.adminWhatsappNumbers) {
      const result = await sendWhatsAppTemplateMessage(
        subdomain,
        'leave_request',
        adminNumber,
        null,
        bodyParameters
      );
      results.push({ number: adminNumber, ...result });
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`[WhatsApp] Notifications sent to ${successful}/${config.adminWhatsappNumbers.length} admin numbers`);

    return {
      success: successful > 0,
      results: results,
      summary: `${successful} successful, ${failed} failed`
    };

  } catch (error) {
    console.error('[WhatsApp Error] Failed to send leave notification:', error.message);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendNewLeaveRequestNotification
};