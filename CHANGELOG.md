# Lịch sử phiên bản

Phiên bản hiện tại nằm trong file [`VERSION`](VERSION), dạng **LỚN.NHỎ** (vd `1.0`, `1.1`, `2.0`).
Hiện ở cuối mọi trang ("Phiên bản 1.1 · mã commit"), trong app Android ("App v1.1"), và trong tên file tải app (`safe-exam-v1.1.apk`).

## Quy tắc đặt phiên bản

| Loại thay đổi | Cách tăng | Ví dụ |
|---|---|---|
| **Cập nhật nhỏ**: sửa lỗi, thêm / chỉnh chức năng, đổi giao diện — học sinh vẫn dùng như cũ | tăng số **sau** dấu chấm | 1.0 → 1.1 → 1.2 |
| **Cập nhật lớn**: đổi cách thi / đăng nhập, thay đổi lớn về khoá máy, bắt buộc mọi người làm lại từ đầu | tăng số **trước** dấu chấm, số sau về 0 | 1.5 → 2.0 |

- Tăng phiên bản: `npm run version:small` (nhỏ) hoặc `npm run version:big` (lớn) — tự sửa `VERSION` và thêm mục mới ở đầu file này để ghi lại thay đổi.
- Mỗi lần đưa lên (push) có thay đổi cho người dùng thì **phải tăng phiên bản**, để nhìn số là biết đang dùng bản nào.
- Có sửa app Android (thư mục `android/`) → học sinh phải **gỡ app cũ, cài lại** bản mới. Ghi rõ trong mục của phiên bản đó.

---

## 1.2

- **Mật khẩu đề**: mọi ô nhập mật khẩu (vào đề nếu bật, cho làm lại, mở khoá bài, thoát khẩn cấp) nhận **mật khẩu chung** (`PROCTOR_PASSWORD`, mặc định cho mọi đề) **hoặc mật khẩu riêng 6 số của đề**. Nút chìa khoá bên admin hiện cả 2, đổi được mật khẩu riêng. Mật khẩu không còn tự đổi sau khi cho làm lại.
- **Cho làm lại nhiều lần** (mỗi đề, mặc định tắt): bật thì học sinh bấm "Làm lại" là vào làm ngay, không cần mật khẩu. Đang làm dở mà admin tắt vẫn nộp được lượt đó.
- **Thoát khẩn cấp** đúng mật khẩu → về **danh sách đề** (không đăng xuất, không đóng app / SEB), bài làm giữ để "Tiếp tục làm bài".
- **Nộp bài xong** chỉ còn "Xem lịch sử làm bài" và "Về trang đề thi" (trong Safe Exam Browser thêm nút "Thoát Safe Exam Browser").
- Trang học sinh: nút **Tải lại** danh sách đề; lời nhắn + nguyên tắc thưởng sau khi đăng nhập; câu tự luận ghi "Nguyên cứ làm ra giấy rồi gửi cho chị Thảo chấm nha".
- Sửa lỗi: bài làm dở bị dùng chung giữa các tên đăng nhập trên cùng 1 trình duyệt; nộp trùng khi mất mạng rồi bấm "Thử nộp lại"; kẹt làm lại sau khi tắt "cho làm lại nhiều lần"; thẻ đề hiện "Đã nộp" khi đang làm dở lượt mới.
- Chống dò mật khẩu: thêm giới hạn theo máy (IP) dùng chung cho mọi ô nhập mật khẩu (30 lần sai trong 10 phút).
- Database: migration `0009` (`exams.allow_retake`), `0010` (`exam_events.attempt`, `exam_results.submission_key`).
- Cần đặt `PROCTOR_PASSWORD` trên Vercel. Bản nháp làm dở lưu theo cách cũ (chưa gắn tên học sinh) không còn hiện. App Android **không** cần cài lại.

## 1.1

- Tên file tải app kèm phiên bản: `safe-exam-v1.1.apk`; link tải ngắn cố định **https://safe-seb.vercel.app/tai-app** (luôn trỏ tới bản mới nhất).
- Phiên bản dạng LỚN.NHỎ + quy tắc đặt phiên bản (file này). App hiện "App v1.1". Quy tắc commit: `docs/quy-tac-commit.md`.
- Lịch sử làm bài xem theo **từng đề**: nút "Lịch sử" trên thẻ đề mở hộp lịch sử (3 lần / trang, mới nhất trước); bỏ phần lịch sử ở cuối trang.
- Mỗi lần giám thị cho làm lại, **mã giám thị của đề tự đổi** (mã cũ hết hiệu lực) — xem mã mới ở nút chìa khoá bên admin.
- **App Android: cần gỡ app cũ, cài lại.**

## 1.0

- App Android: sửa lỗi bấm "Nộp bài" không có tác dụng; chỉ ghim màn hình khi bấm vào đề; nộp xong tự bỏ ghim.
- Thoát sau khi nộp không cần mã giám thị (mã chỉ cần khi thoát giữa chừng).
- Admin: công tắc "Khoá bài khi học sinh rời trang" cho từng đề (mặc định tắt).
- Danh sách đề + lịch sử làm bài phân trang 3 mục, mới nhất trước, tìm đề theo tên.
- Admin: kết quả + sự cố lọc theo ngày (mặc định hôm nay), thí sinh, mã đề; phân trang.
- Tên dài hiện đầy đủ. Hiện phiên bản ở cuối trang.
