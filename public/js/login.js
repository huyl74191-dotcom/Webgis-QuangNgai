// =====================================================
// TRANG ĐĂNG NHẬP — Gọi API /api/dang-nhap
// =====================================================

const loginForm = document.getElementById("loginForm");
const loginAlert = document.getElementById("loginAlert");
const btnLogin = document.getElementById("btnLogin");

function showLoginAlert(message, type = "danger") {
    loginAlert.innerHTML = `
        <div class="alert alert-${type} py-2">${message}</div>
    `;
}

function clearLoginAlert() {
    loginAlert.innerHTML = "";
}

loginForm.addEventListener("submit", function (e) {
    e.preventDefault();

    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;

    if (!username || !password) {
        showLoginAlert("Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.");
        return;
    }

    clearLoginAlert();
    btnLogin.disabled = true;
    btnLogin.textContent = "Đang đăng nhập...";

    fetch("/api/dang-nhap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
    })
        .then(function (res) {
            return res.json().then(function (data) {
                return { ok: res.ok, data };
            });
        })
        .then(function ({ ok, data }) {
            if (!ok || !data.success) {
                throw new Error(data.error || "Đăng nhập thất bại");
            }

            showLoginAlert(
                "Đăng nhập thành công! Đang chuyển hướng...",
                "success"
            );

            // Chuyển về trang chủ sau khi đăng nhập thành công
            setTimeout(function () {
                window.location.href = "/";
            }, 800);
        })
        .catch(function (err) {
            showLoginAlert(err.message);
        })
        .finally(function () {
            btnLogin.disabled = false;
            btnLogin.textContent = "Đăng nhập";
        });
});