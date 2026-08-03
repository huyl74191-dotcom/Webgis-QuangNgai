// =====================================================
// Xử lý bấm icon 3 gạch (hamburger) để mở/đóng menu
// Dùng chung cho tất cả các trang có cùng cấu trúc header
// =====================================================
document.addEventListener("DOMContentLoaded", function () {

    const toggler = document.getElementById("navToggler");
    const navList = document.getElementById("navList");

    if (!toggler || !navList) return;

    toggler.addEventListener("click", function () {

        // Bật/tắt class "open" -> CSS sẽ xổ menu ra (xem @media trong style.css)
        navList.classList.toggle("open");

        // Cập nhật trạng thái cho screen reader (hỗ trợ tiếp cận)
        const isOpen = navList.classList.contains("open");
        toggler.setAttribute("aria-expanded", isOpen);
    });

});