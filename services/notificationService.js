// services/notificationService.js

const axios = require('axios');
const GowhatsConfig = require('../models/GowhatsConfig');
const Worker = require('../models/Worker');

/**
 * A reusable function to send any WhatsApp template message.
 * It fetches the API key and phone number ID for a given subdomain.
 * @param {string} subdomain - The tenant's subdomain.
 * @param {string} templateName - The exact name of the template in WhatsApp Manager.
 * @param {string} recipientNumber - The recipient's phone number in international format (e.g., 919876543210).
 * @param {Array|null} headerParams - An array of parameter objects for the template header.
 * @param {Array|null} bodyParams - An array of parameter objects for the template body.
 * @returns {Promise<Object>} - A promise that resolves to an object indicating success or failure.
 */
const sendWhatsAppTemplateMessage = async (subdomain, templateName, recipientNumber, headerParams, bodyParams) => {
  try {
    const config = await GowhatsConfig.findOne({ subdomain });

    if (!config || !config.apiKey || !config.phoneNumberId) {
      console.error(`[WhatsApp Error] GoWhats configuration not found or incomplete for subdomain: ${subdomain}`);
      return { success: false, error: 'Configuration not found or incomplete' };
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

    console.log('[WhatsApp] Sending template message payload:', JSON.stringify(messageData, null, 2));
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
 * Specifically handles sending the "leave_request" notification to all configured admin numbers.
 * It fetches the leave details, formats them, and calls the generic message sender.
 * @param {Object} leave - The Mongoose leave document containing all details of the leave application.
 * @returns {Promise<Object>} - A promise that resolves to an object summarizing the notification results.
 */
const sendNewLeaveRequestNotification = async (leave) => {
  try {
    // Destructure all required fields from the leave object
    const { subdomain, worker: workerId, leaveType, startDate, endDate, totalDays, reason, startTime, endTime } = leave;

    const config = await GowhatsConfig.findOne({ subdomain });
    if (!config || !config.adminWhatsappNumbers || config.adminWhatsappNumbers.length === 0) {
      console.error(`[WhatsApp Error] Admin WhatsApp numbers not configured for ${subdomain}`);
      return { success: false, error: 'Admin numbers not configured' };
    }

    const worker = await Worker.findById(workerId).select('name');
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

    // --- CRITICAL FIX ---
    // The following code ensures that even if `startTime` or `endTime` are undefined or null,
    // a fallback string 'N/A' is used. This prevents the "Invalid parameter" API error.
    const bodyParameters = [
      { type: 'text', text: worker.name },                                                // {{1}} Employee Name
      { type: 'text', text: leaveType },                                                    // {{2}} Leave Type
      { type: 'text', text: formatDate(startDate) },                                        // {{3}} Start Date
      { type: 'text', text: formatDate(endDate) },                                          // {{4}} End Date
      { type: 'text', text: leaveType === 'Permission' ? (startTime || 'N/A') : 'N/A' },    // {{5}} Start Time (Corrected)
      { type: 'text', text: leaveType === 'Permission' ? (endTime || 'N/A') : 'N/A' },      // {{6}} End Time (Corrected)
      { type: 'text', text: totalDays.toString() },                                         // {{7}} Total Days
      { type: 'text', text: reason }                                                        // {{8}} Reason
    ];

    // Send the notification to all configured admin numbers
    const results = [];
    for (const adminNumber of config.adminWhatsappNumbers) {
      const result = await sendWhatsAppTemplateMessage(
        subdomain,
        'leave_request', // Ensure this matches your template name in WhatsApp Manager
        adminNumber,
        null, // No header parameters
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
    console.error('[WhatsApp Error] Critical failure in sendNewLeaveRequestNotification:', error.message);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendNewLeaveRequestNotification
};