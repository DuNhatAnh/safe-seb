// Truy van bang exam_events (su co phong thi)
class EventRepository {
  constructor(db) {
    this.db = db;
  }

  // event: { exam_id, exam_title, student_name, type, detail, action_logs }
  create(event) {
    return this.db.insert("exam_events", event);
  }
}

module.exports = { EventRepository };
