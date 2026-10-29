// OmniOTP Android Integration (Retrofit)
// Add to your app module build.gradle:
// implementation "com.squareup.retrofit2:retrofit:2.9.0"
// implementation "com.squareup.retrofit2:converter-gson:2.9.0"

package com.omniotp.example

import retrofit2.Response
import retrofit2.http.*

data class SendOtpRequest(val phone: String, val length: Int = 6, val expiry_minutes: Int = 5)
data class SendOtpResponse(val success: Boolean, val session_id: String?, val message: String?)
data class VerifyOtpRequest(val session_id: String, val otp: String, val phone: String? = null)
data class VerifyOtpResponse(val success: Boolean, val verified: Boolean, val message: String?)

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

// Usage:
// val api = Retrofit.Builder()
//   .baseUrl("https://omniotp.onrender.com/") // emulator -> localhost
//   .addConverterFactory(GsonConverterFactory.create())
//   .build()
//   .create(OmniOtpApi::class.java)
//
// val res = api.sendOtp("sk_live_change_me_in_production", SendOtpRequest("+919876543210"))
