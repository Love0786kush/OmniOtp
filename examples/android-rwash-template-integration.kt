// OmniOTP Android Integration (Rwash template)
// Template: "Rwash login key is: {{otp}}. Valid for {{expiry}}"

package com.omniotp.example

import retrofit2.Response
import retrofit2.http.*

data class SendOtpRequest(
    val phone: String,
    val app_name: String = "Rwash",
    val length: Int = 6,
    val expiry_minutes: Int = 5,
    val template: String = "Rwash login key is: {{otp}}. Valid for {{expiry}}"
)

data class SendOtpResponse(
    val success: Boolean,
    val session_id: String?,
    val phone: String?,
    val message: String?
)

data class VerifyOtpRequest(
    val session_id: String,
    val otp: String,
    val phone: String? = null
)

data class VerifyOtpResponse(
    val success: Boolean,
    val verified: Boolean,
    val message: String?
)

interface OmniOtpApi {
    @POST("api/v1/otp/send")
    suspend fun sendOtp(
        @Header("x-api-key") apiKey: String,
        @Body request: SendOtpRequest
    ): Response<SendOtpResponse>

    @POST("api/v1/otp/verify")
    suspend fun verifyOtp(
        @Header("x-api-key") apiKey: String,
        @Body request: VerifyOtpRequest
    ): Response<VerifyOtpResponse>
}

/*
Usage:
val retrofit = Retrofit.Builder()
    .baseUrl("https://omniotp.onrender.com/")
    .addConverterFactory(GsonConverterFactory.create())
    .build()
val api = retrofit.create(OmniOtpApi::class.java)
val PLATFORM_KEY = "sk_live_change_me_in_production"

// Send OTP with Rwash template
val sendRes = api.sendOtp(
    PLATFORM_KEY,
    SendOtpRequest(phone = "+919876543210", expiry_minutes = 5)
)
if (sendRes.isSuccessful && sendRes.body()?.success == true) {
    val sessionId = sendRes.body()?.session_id
    // ask user for OTP
}

// Verify OTP
val verifyRes = api.verifyOtp(
    PLATFORM_KEY,
    VerifyOtpRequest(session_id = sessionId!!, otp = "123456", phone = "+919876543210")
)
if (verifyRes.isSuccessful && verifyRes.body()?.verified == true) {
    // login success
}
*/
