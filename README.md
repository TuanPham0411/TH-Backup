# TH — website cá nhân

Website tiếng Việt dùng Vite và Firebase SDK, triển khai qua GitHub → Netlify. Email, điện thoại và Zalo của chủ website được hiển thị tại mục liên hệ.

## Phát triển và build

Yêu cầu Node.js 24, npm. Dùng checkout hiện có; không cần tạo worktree.

```sh
npm ci --cache /tmp/th-npm-cache
npm run dev
npm test
npm run build
npm run preview -- --port 4173
```

Vite lấy nguồn trong `site/`; bản production nằm ở `dist/web/`. Không dùng Python server để chạy trực tiếp nguồn vì mã JavaScript cần Vite xử lý. Netlify tự build theo `netlify.toml`, nhánh triển khai `main`. Nếu dashboard còn ghi đè thiết lập cũ, đặt build command `npm run build`, publish directory `dist/web`, base directory để trống.

## Kích hoạt Firebase

Mã giao diện đã có đăng nhập Google, email/mật khẩu, đăng ký, đặt lại mật khẩu, xác minh email, đăng xuất và sửa tên hồ sơ. Cấu hình công khai của project `th-web-d816f` đã được tích hợp trong `site/firebase-config.js`. Không cần nhập biến Netlify để dùng project này. Các biến `VITE_FIREBASE_*` là tùy chọn để đổi project: nếu dùng, phải cung cấp đủ cả bốn biến để tránh trộn project. Khi cấu hình không đầy đủ, giao diện khóa thao tác gửi yêu cầu. Build thành công không chứng minh Firebase đang hoạt động.

1. Tạo project trong Firebase Console. Đăng ký ứng dụng Web và lấy `firebaseConfig`. Đây là cấu hình công khai, không phải service account hoặc private key.
2. Trong Authentication → Sign-in method bật Email/Password và Google, cấu hình email hỗ trợ cho Google.
3. Trong Authentication → Settings → Authorized domains thêm `th.io.vn`, `www.th.io.vn`, `q-th.netlify.app`. Thêm `localhost` khi cần phát triển cục bộ; project mới có thể không thêm localhost tự động.
4. Tạo Cloud Firestore theo chế độ Production. Trong Rules, dán nội dung `firestore.rules` và Publish. Quy tắc chỉ cho tài khoản có email xác minh đọc/ghi hồ sơ `users/{uid}` của chính mình; chỉ lưu `displayName` và `updatedAt`. Không có quy tắc truy cập công khai, trường quyền quản trị hoặc ghi dữ liệu của người khác.
5. Tùy chọn: nếu cần dùng project khác, trong Netlify → Environment variables thêm đủ bốn biến có phạm vi Builds, rồi deploy lại:

| Biến | Trường Firebase |
|---|---|
| `VITE_FIREBASE_API_KEY` | `apiKey` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain` |
| `VITE_FIREBASE_PROJECT_ID` | `projectId` |
| `VITE_FIREBASE_APP_ID` | `appId` |

Giữ authDomain được Firebase cấp, thường là `PROJECT.firebaseapp.com`. Không tự thay bằng tên miền website. Biến `VITE_*` được nhúng vào bundle công khai; tuyệt đối không dùng cho credential máy chủ. Có thể sao chép `.env.example` thành `.env.local` để phát triển; file này được Git bỏ qua.

## Kiểm tra thực tế sau khi kích hoạt

- Đăng ký một email mới; kiểm tra email xác minh, mở liên kết rồi bấm “Tôi đã xác minh”.
- Lưu tên hồ sơ, kiểm tra document ở `users/<uid>` trong Firestore; đăng xuất rồi đăng nhập lại.
- Thử mật khẩu sai, reset mật khẩu qua email và Google popup trên tên miền production.
- Xác nhận người chưa đăng nhập, tài khoản chưa xác minh, và tài khoản khác không đọc/ghi được document của người khác bằng Rules Playground hoặc Firebase Emulator Suite.
- Kiểm tra HTTPS và chuyển hướng www trên Netlify; DNS được quản lý tại Netlify sau khi đổi nameserver tại Nhân Hòa.

Chưa kiểm chứng các luồng Firebase thật hoặc triển khai rules vì chưa có quyền quản trị Firebase và truy cập mạng tới dịch vụ xác thực bị hạn chế trong phiên làm việc. Cấu hình project đã có; vẫn cần xác nhận providers, Authorized domains và Firestore Rules. Cần hoàn thành kiểm tra trên trước khi tuyên bố tính năng tài khoản sẵn sàng. Có thể phát sinh phí theo hạn mức dịch vụ; không bật SMS hoặc Storage trong phiên bản này.

## Quyền riêng tư

Email đăng nhập và tên hiển thị được Firebase xử lý để quản lý tài khoản. Website không lưu mật khẩu vào Firestore hay localStorage; Firebase SDK quản lý phiên đăng nhập. Hồ sơ không hiển thị công khai. Khi vận hành, bổ sung chính sách quyền riêng tư, thời hạn lưu giữ và quy trình xóa tài khoản phù hợp nhu cầu thực tế.

## Màn hình đăng nhập trước trang chính

Khách chưa đăng nhập bắt đầu ở màn hình neon dark mode. Trang chính ẩn sẵn trong HTML để không chớp hiện trong khi Firebase khôi phục phiên. Người có phiên hợp lệ vào trang chính; đăng xuất quay lại màn hình đăng nhập. Đăng ký tạo phiên đăng nhập; email cần xác minh trước khi lưu hồ sơ Firestore. Đây là kiểm soát điều hướng phía trình duyệt: nội dung trang cá nhân tĩnh vẫn có trong bundle công khai. Dữ liệu riêng phải tiếp tục được bảo vệ bằng Firebase Rules, không dựa vào việc ẩn HTML. Animation được tắt theo prefers-reduced-motion.
