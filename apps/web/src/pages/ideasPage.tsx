import { useEffect, useState } from "react";
import { getIdeas, type Idea } from "../api/client";

export default function IdeasPage() {
    const [ideas, setIdeas] = useState<Idea[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        void getIdeas().then((result) => setIdeas(result.ideas)).catch((requestError) => {
            setError(requestError instanceof Error ? requestError.message : "Failed to load ideas");
        }).finally(() => setLoading(false));
    }, []);

    return (
        <main className="page">
            <header className="page-header">
                <div>
                    <p className="eyebrow">IT OPERATIONS</p>
                    <h1>Ideas</h1>
                    <p className="subtitle">Improvement proposals from employees</p>
                </div>
            </header>
            {loading && <div className="state-card">Loading ideas...</div>}
            {error && <div className="state-card error-card">{error}</div>}
            {!loading && !error && <section className="table-card"><div className="table-scroll"><table className="tickets-table"><thead><tr><th>ID</th><th>Date</th><th>Time</th><th>Employee</th><th>City</th><th>Department</th><th>System</th><th>Idea</th><th>Expected Result</th><th>Priority</th><th>Status</th><th>Assignee</th><th>Comment</th></tr></thead><tbody>{ideas.map((idea) => <tr key={idea.id}><td className="id-cell">{idea.public_id}</td><td>{idea.date}</td><td>{idea.time}</td><td>{idea.employee}</td><td>{idea.city || ""}</td><td>{idea.department || ""}</td><td>{idea.system || ""}</td><td className="wide-cell">{idea.idea}</td><td className="wide-cell">{idea.expected_result || ""}</td><td>{idea.priority}</td><td>{idea.status}</td><td>{idea.assignee || ""}</td><td className="wide-cell">{idea.comment || ""}</td></tr>)}</tbody></table></div>{!ideas.length && <div className="empty-state">No ideas found.</div>}</section>}
        </main>
    );
}
