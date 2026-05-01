import { useEffect, useState } from 'react';

// Define the shape of your database row
interface Appointment {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  issueDescription: string;
  appointmentTime: string;
  trackingToken: string;
}

export default function Dashboard() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isCalendarLinked, setIsCalendarLinked] = useState<boolean>(false);
  const companyId = localStorage.getItem('companyId');

  useEffect(() => {
    // 1. Fetch Appointments
    fetch(`http://localhost:8080/api/v1/appointments?companyId=${companyId}`)
      .then(res => res.json())
      .then(data => setAppointments(data))
      .catch(err => console.error("Failed to load appointments", err));

    // 2. Fetch Calendar Link Status
    fetch(`http://localhost:8080/api/v1/auth/status?companyId=${companyId}`)
      .then(res => res.json())
      .then(data => setIsCalendarLinked(data.isCalendarLinked))
      .catch(err => console.error("Failed to load status", err));
  }, [companyId]);

  const handleLogout = () => {
    localStorage.removeItem('companyId');
    window.location.href = '/login';
  };

  const widgetCode = `<script src="http://localhost:8080/widget.js" data-company-id="${companyId}"></script>`;

  return (
    <div className="max-w-5xl mx-auto p-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-800">Organization Dashboard</h1>
        <button onClick={handleLogout} className="text-red-500 hover:text-red-700 font-semibold">
          Logout
        </button>
      </div>

      {/* Conditionally Render Step 1: Connect Calendar */}
      {!isCalendarLinked ? (
        <div className="bg-white p-6 rounded-xl shadow-sm mb-6 flex justify-between items-center border-l-4 border-red-500">
          <div>
            <h3 className="text-xl font-bold text-gray-800">Action Required: Connect Calendar</h3>
            <p className="text-gray-600 mt-1">Your AI cannot book jobs until you link your Google Calendar.</p>
          </div>
          {/* Note: In your frontend, the <a> tag was pointing to /api/v1/..., but since your router is flat, adjust the URL below to match your actual backend route! */}
          <a href={`http://localhost:8080/api/v1/auth/google?companyId=${companyId}`}>
            <button className="bg-red-500 text-white font-bold py-2 px-6 rounded hover:bg-red-600 transition shadow">
              Connect Google Calendar
            </button>
          </a>
        </div>
      ) : (
        <div className="bg-green-50 p-6 rounded-xl shadow-sm mb-6 flex justify-between items-center border-l-4 border-green-500">
          <div>
            <h3 className="text-xl font-bold text-green-800">Calendar Connected ✓</h3>
            <p className="text-green-700 mt-1">Your AI agent is actively syncing with your Google Calendar.</p>
          </div>
        </div>
      )}

      {/* Step 2: Widget Embed */}
      {isCalendarLinked && (
        <div className="bg-white p-6 rounded-xl shadow-sm mb-6 border border-gray-100">
          <h3 className="text-xl font-bold text-gray-800">Step 2: Embed the AI Agent</h3>
          <p className="text-gray-600 mt-1 mb-4">
            Copy and paste this script right before the closing <code>&lt;/body&gt;</code> tag on your website.
          </p>
          <div className="bg-gray-900 text-gray-100 p-4 rounded-md font-mono overflow-x-auto text-sm">
            {widgetCode}
          </div>
        </div>
      )}

      {/* Appointments Table */}
      <div className="bg-white p-6 rounded-xl shadow-sm">
        <h3 className="text-xl font-bold text-gray-800 mb-4">Upcoming Appointments</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="p-4 font-semibold text-gray-700">Customer</th>
                <th className="p-4 font-semibold text-gray-700">Contact</th>
                <th className="p-4 font-semibold text-gray-700">Issue</th>
                <th className="p-4 font-semibold text-gray-700">Time</th>
                <th className="p-4 font-semibold text-gray-700">Token</th>
              </tr>
            </thead>
            <tbody>
              {appointments.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-500 italic">
                    No appointments booked yet.
                  </td>
                </tr>
              ) : (
                appointments.map((appt, idx) => (
                  <tr key={idx} className="border-b hover:bg-gray-50">
                    <td className="p-4 text-gray-800 font-medium">{appt.customerName}</td>
                    <td className="p-4 text-gray-600 text-sm">
                      {appt.customerPhone}<br/>
                      <span className="text-gray-400">{appt.customerEmail}</span>
                    </td>
                    <td className="p-4 text-gray-600">{appt.issueDescription}</td>
                    <td className="p-4 text-gray-800">{new Date(appt.appointmentTime).toLocaleString('en-IN')}</td>
                    <td className="p-4">
                      <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded font-mono text-sm border">
                        {appt.trackingToken}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}