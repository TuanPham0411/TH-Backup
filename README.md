# TH — th.io.vn

Website cá nhân tĩnh, tiếng Việt, không cần cài dependencies hay bước build. Toàn bộ nội dung xuất bản nằm trong `site/`. Thương hiệu TH; liên hệ email, điện thoại và Zalo đã được chủ website cung cấp.

## Chạy thử

Tại `/workspace/Thien-Ha`:

```sh
python3 -m http.server 8080 --directory site --bind 127.0.0.1
```

Kiểm tra nội bộ bằng `curl --fail http://127.0.0.1:8080/`. Dừng máy chủ bằng Ctrl+C.

## Gói triển khai

```sh
mkdir -p dist
cd site
zip -r ../dist/th-site.zip index.html styles.css favicon.svg
```

Gói ZIP có `index.html` ở thư mục gốc. Không đưa `.git` lên hosting.

## Triển khai miễn phí với Netlify

1. Đăng nhập hoặc tạo tài khoản Netlify, kiểm tra điều kiện và giới hạn gói Free hiện hành.
2. Chọn thêm project bằng triển khai thủ công (Deploy manually), tải thư mục `site` hoặc gói ZIP lên theo định dạng giao diện chấp nhận.
3. Kiểm tra trang tại địa chỉ Netlify cấp trước khi gắn tên miền.
4. Vào Domain management, thêm custom domain `th.io.vn` và `www.th.io.vn` nếu muốn dùng cả hai. Chọn tên miền chính.
5. Chọn dùng DNS bên ngoài. Lấy bản ghi chính xác từ hướng dẫn DNS của project Netlify.
6. Tại bảng DNS Nhân Hòa, sao lưu hoặc ghi lại bản ghi hiện có. Chỉ cập nhật bản ghi web liên quan tới `@` và `www` theo Netlify. Giữ nguyên MX, TXT và các bản ghi phục vụ email. Không đổi nameserver nếu chưa đánh giá các dịch vụ đang dùng.
7. Sau khi DNS cập nhật, kiểm tra xác minh domain và chứng chỉ HTTPS trên Netlify; kiểm tra cả tên miền chính và chuyển hướng `www` nếu đã cấu hình.

Không đoán địa chỉ IP DNS. Không chia sẻ mật khẩu, token hoặc mã khôi phục trong chat. Tài khoản hosting và thay đổi DNS cần chủ tài khoản thực hiện hoặc cấp quyền qua cơ chế hỗ trợ.
