package com.example.omniotp

import android.os.Bundle
import android.os.CountDownTimer
import android.view.View
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch

/**
 * Android Complete OTP Verification Activity
 * Drop this activity into your Android app to get a full SMS OTP login flow!
 */
class OtpVerificationActivity : AppCompatActivity() {

    // Replace with your OmniOTP Platform API Key from the Admin Panel
    private val API_KEY = "sk_live_android_app_demo"
    private val apiService by lazy { OtpApiService.create() }

    private var activeSessionId: String? = null
    private var resendTimer: CountDownTimer? = null

    // UI Views
    private lateinit var etPhone: EditText
    private lateinit var btnSendOtp: Button
    private lateinit var layoutVerifySection: LinearLayout
    private lateinit var etOtpCode: EditText
    private lateinit var btnVerifyOtp: Button
    private lateinit var tvTimer: TextView
    private lateinit var btnResend: Button
    private lateinit var progressBar: ProgressBar

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_otp_verification)

        // Initialize UI Elements
        etPhone = findViewById(R.id.etPhoneNumber)
        btnSendOtp = findViewById(R.id.btnSendOtp)
        layoutVerifySection = findViewById(R.id.layoutVerifySection)
        etOtpCode = findViewById(R.id.etOtpCode)
        btnVerifyOtp = findViewById(R.id.btnVerifyOtp)
        tvTimer = findViewById(R.id.tvTimer)
        btnResend = findViewById(R.id.btnResend)
        progressBar = findViewById(R.id.progressBar)

        btnSendOtp.setOnClickListener {
            val phone = etPhone.text.toString().trim()
            if (phone.length < 10) {
                Toast.makeText(this, "Please enter a valid 10-digit mobile number", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            dispatchOtp(phone)
        }

        btnVerifyOtp.setOnClickListener {
            val code = etOtpCode.text.toString().trim()
            if (code.length != 6) {
                Toast.makeText(this, "Enter 6-digit OTP code", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            verifyOtpCode(code)
        }

        btnResend.setOnClickListener {
            val phone = etPhone.text.toString().trim()
            dispatchOtp(phone)
        }
    }

    private fun dispatchOtp(phone: String) {
        progressBar.visibility = View.VISIBLE
        btnSendOtp.isEnabled = false

        lifecycleScope.launch {
            try {
                val req = SendOtpRequest(phone = phone, app_name = "My Android App")
                val response = apiService.sendOtp(apiKey = API_KEY, request = req)

                progressBar.visibility = View.GONE
                btnSendOtp.isEnabled = true

                if (response.isSuccessful && response.body()?.success == true) {
                    activeSessionId = response.body()?.session_id
                    Toast.makeText(this@OtpVerificationActivity, "OTP dispatched via SMS!", Toast.LENGTH_SHORT).show()
                    layoutVerifySection.visibility = View.VISIBLE
                    startCountdownTimer()
                } else {
                    val errMsg = response.body()?.error ?: "Failed to dispatch OTP"
                    Toast.makeText(this@OtpVerificationActivity, "Error: $errMsg", Toast.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                progressBar.visibility = View.GONE
                btnSendOtp.isEnabled = true
                Toast.makeText(this@OtpVerificationActivity, "Network error: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun verifyOtpCode(code: String) {
        val sessionId = activeSessionId ?: run {
            Toast.makeText(this, "Please request an OTP first", Toast.LENGTH_SHORT).show()
            return
        }

        progressBar.visibility = View.VISIBLE
        btnVerifyOtp.isEnabled = false

        lifecycleScope.launch {
            try {
                val req = VerifyOtpRequest(session_id = sessionId, otp = code)
                val response = apiService.verifyOtp(apiKey = API_KEY, request = req)

                progressBar.visibility = View.GONE
                btnVerifyOtp.isEnabled = true

                if (response.isSuccessful && response.body()?.verified == true) {
                    Toast.makeText(this@OtpVerificationActivity, "✓ Phone Verified Successfully!", Toast.LENGTH_LONG).show()
                    // Navigate to Main Dashboard / Home Screen
                    // startActivity(Intent(this@OtpVerificationActivity, MainActivity::class.java))
                    // finish()
                } else {
                    val error = response.body()?.error ?: "Invalid OTP code"
                    val attempts = response.body()?.attempts_left
                    val msg = if (attempts != null) "$error ($attempts attempts remaining)" else error
                    Toast.makeText(this@OtpVerificationActivity, msg, Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                progressBar.visibility = View.GONE
                btnVerifyOtp.isEnabled = true
                Toast.makeText(this@OtpVerificationActivity, "Verification failed: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun startCountdownTimer() {
        resendTimer?.cancel()
        btnResend.isEnabled = false

        resendTimer = object : CountDownTimer(60000, 1000) {
            override fun onTick(millisUntilFinished: Long) {
                val seconds = millisUntilFinished / 1000
                tvTimer.text = "Resend available in ${seconds}s"
            }

            override fun onFinish() {
                tvTimer.text = "Didn't receive SMS?"
                btnResend.isEnabled = true
            }
        }.start()
    }

    override fun onDestroy() {
        super.onDestroy()
        resendTimer?.cancel()
    }
}
