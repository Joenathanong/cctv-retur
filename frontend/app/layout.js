import './globals.css';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';

export const metadata = {
  title: 'Warehouse CCTV System',
  description: 'Return CCTV Automation Dashboard'
};

export default function RootLayout({ children }) {
  return (
    <html lang="id" className="dark">
      <body className="bg-surface text-slate-200 flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <main className="flex-1 overflow-y-auto p-6 bg-surface">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
