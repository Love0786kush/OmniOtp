package com.example.omniotp

import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.Body
import retrofit2.http.Header
import retrofit2.http.POST

/**
 * OmniOTP Universal Provider - Android Retrofit API Client
 * Compatible with httpSMS backend, Cloudflare Worker, or local server.
 */

// Request & Response Data Classes
data class SendOtpRequest(
    val phone: String,
    val length: Int = 6,
    val expiry_minutes: Int = 5,
    val app_name: String = "My Android App"
)

data class SendOtpResponse(
    val success: Boolean,
    val session_id: String?,
    val phone: String?,
    val expires_in_seconds: Int?,
    val message: String?,
    val error: String?
)

data class VerifyOtpRequest(
    val session_id: String,
    val otp: String
)

data class VerifyOtpResponse(
    val success: Boolean,
    val verified: Boolean,
    val message: String?,
    val error: String?,
    val attempts_left: Int?
)

interface OtpApiService {
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

    companion object {
        // Change this URL to your deployed Cloudflare Worker, VPS server, or local IP
        private const val BASE_URL = "http://10.0.2.2:5000/" // 10.0.2.2 is localhost in Android Emulator

        fun create(): OtpApiService {
            return Retrofit.Builder()
                .baseUrl(BASE_URL)
                .addConverterFactory(GsonConverterFactory.create())
                .build()
                .create(OtpApiService::class.java)
        }
    }
}
