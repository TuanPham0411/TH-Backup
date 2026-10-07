export function configured(config) {
  return ['apiKey', 'authDomain', 'projectId', 'appId'].every(key => typeof config[key] === 'string' && config[key].trim().length > 0);
}
export function friendlyError(error) {
  const messages = {
    'auth/invalid-credential': 'Email hoặc mật khẩu chưa đúng.',
    'auth/user-not-found': 'Email hoặc mật khẩu chưa đúng.',
    'auth/wrong-password': 'Email hoặc mật khẩu chưa đúng.',
    'auth/email-already-in-use': 'Email này đã có tài khoản. Hãy đăng nhập hoặc đặt lại mật khẩu.',
    'auth/weak-password': 'Hãy chọn mật khẩu mạnh hơn, ít nhất 6 ký tự.',
    'auth/invalid-email': 'Vui lòng nhập địa chỉ email hợp lệ.',
    'auth/popup-closed-by-user': 'Bạn đã đóng cửa sổ đăng nhập. Có thể thử lại.',
    'auth/popup-blocked': 'Trình duyệt chặn cửa sổ Google. Hãy cho phép cửa sổ bật lên và thử lại.',
    'auth/unauthorized-domain': 'Tên miền này chưa được cho phép đăng nhập. Vui lòng liên hệ TH.',
    'auth/operation-not-allowed': 'Phương thức đăng nhập này chưa được bật. Vui lòng liên hệ TH.',
    'auth/network-request-failed': 'Không kết nối được dịch vụ đăng nhập. Hãy kiểm tra mạng và thử lại.',
    'auth/too-many-requests': 'Có quá nhiều yêu cầu. Vui lòng thử lại sau.',
    'auth/account-exists-with-different-credential': 'Email đã dùng phương thức đăng nhập khác. Hãy đăng nhập bằng phương thức ban đầu.',
    'permission-denied': 'Chưa lưu được hồ sơ. Hãy xác minh email hoặc liên hệ TH.',
    'unavailable': 'Dịch vụ dữ liệu tạm thời không kết nối được. Hãy thử lại sau.'
  };
  return messages[error?.code] || 'Thao tác chưa hoàn tất. Vui lòng thử lại hoặc liên hệ TH.';
}
export function validName(value) { return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 80; }
