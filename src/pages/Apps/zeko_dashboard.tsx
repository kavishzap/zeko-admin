import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { IRootState } from '../../store';
import { setPageTitle } from '../../store/themeConfigSlice';
import ReactApexChart from 'react-apexcharts';
import { createClient } from '@supabase/supabase-js';
import { ApexOptions } from 'apexcharts';

const supabase = createClient(
  import.meta.env.VITE_REACT_APP_SUPABASE_URL,
  import.meta.env.VITE_REACT_APP_SUPABASE_ANON_KEY
);

const Dashboard = () => {
  const dispatch = useDispatch();
  const isDark = useSelector((state: IRootState) => state.themeConfig.theme === 'dark' || state.themeConfig.isDarkMode);
  const isRtl = useSelector((state: IRootState) => state.themeConfig.rtlClass === 'rtl');

  const [stats, setStats] = useState({
    users: 0,
    concerts: 0,
    ticketsBooked: 0,
    ticketsPaid: 0,
    ticketsUnpaid: 0,
    revenue: 0,
  });

  const [salesData, setSalesData] = useState<number[]>(Array(7).fill(0));
  const [totalSales, setTotalSales] = useState<number>(0);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [ticketsPaidDetails, setTicketsPaidDetails] = useState<
    { concert: string; tickets: { ticketName: string; quantity: number }[] }[]
  >([]);

  useEffect(() => {
    dispatch(setPageTitle('Dashboard'));
    fetchStats();
    fetchWeeklySales();
  }, [currentDate]);

  const fetchStats = async () => {
    const [users, concerts, bookings, tickets] = await Promise.all([
      supabase.from('user_profiles').select('*', { count: 'exact', head: true }),
      supabase.from('concerts').select('*', { count: 'exact', head: true }),
      supabase.from('bookings').select(`id, total, status, concertid, tickets`),
      supabase.from('tickets').select('id, ticket_name'),
    ]);


    const { data: concertList } = await supabase.from('concerts').select('id, concert_name');

    const paidBookings = bookings.data?.filter(t => t.status === true) || [];

    const groupedTickets: Record<string, Record<string, number>> = {};

    paidBookings.forEach((booking) => {
      const concertName = concertList?.find(c => String(c.id) === String(booking.concertid))?.concert_name ?? 'Unknown Concert';

      (booking.tickets || []).forEach((ticket: any) => {
        const ticketName =
          tickets.data?.find(t => String(t.id) === String(ticket.ticket_id))?.ticket_name?.trim() || 'Unknown Ticket';

        const quantity = ticket.quantity ?? 0;

        if (!groupedTickets[concertName]) {
          groupedTickets[concertName] = {};
        }

        if (!groupedTickets[concertName][ticketName]) {
          groupedTickets[concertName][ticketName] = 0;
        }

        groupedTickets[concertName][ticketName] += quantity;
      });
    });

    const ticketsPaidDetails = Object.entries(groupedTickets).map(([concert, tickets]) => ({
      concert,
      tickets: Object.entries(tickets).map(([ticketName, quantity]) => ({
        ticketName,
        quantity,
      })),
    }));

    const ticketsPaid = ticketsPaidDetails.reduce(
      (sum, concertGroup) => sum + concertGroup.tickets.reduce((subSum, t) => subSum + t.quantity, 0),
      0
    );

    const revenue = paidBookings.reduce((sum, t) => sum + parseFloat(t.total ?? 0), 0);

    setStats({
      users: users.count || 0,
      concerts: concerts.count || 0,
      ticketsBooked: bookings.data?.length || 0,
      ticketsPaid,
      ticketsUnpaid: bookings.data?.filter(t => t.status === false).length || 0,
      revenue,
    });

    setTicketsPaidDetails(ticketsPaidDetails);
  };

  const getWeekRange = (date: Date) => {
    const start = new Date(date);
    const day = start.getDay();
    const diff = start.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(start.setDate(diff));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { monday, sunday };
  };

  const fetchWeeklySales = async () => {
    const { monday, sunday } = getWeekRange(currentDate);
    const from = monday.toISOString().split('T')[0];
    const to = sunday.toISOString().split('T')[0];

    const { data: bookings } = await supabase
      .from('bookings')
      .select('created_at, total, status')
      .gte('created_at', from)
      .lte('created_at', to)
      .eq('status', true);

    const dailySales = Array(7).fill(0);
    let total = 0;

    bookings?.forEach((booking) => {
      const date = new Date(booking.created_at);
      const dayIndex = (date.getDay() + 6) % 7;
      const value = parseFloat(booking.total ?? '0');
if (isNaN(value)) return; // Skip broken value
      dailySales[dayIndex] += value;
      total += value;
    });

    setSalesData(dailySales);
    setTotalSales(total);
  };

  const handlePrevWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(currentDate.getDate() - 7);
    setCurrentDate(newDate);
  };

  const handleNextWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(currentDate.getDate() + 7);
    setCurrentDate(newDate);
  };

  const getWeekLabels = (monday: Date): string[] => {
    const labels: string[] = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(monday);
      day.setDate(monday.getDate() + i);
      const weekday = day.toLocaleDateString(undefined, { weekday: 'short' });
      const datePart = day.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' });
      labels.push(`${weekday} (${datePart})`);
    }
    return labels;
  };

  const options: ApexOptions = {
    chart: { height: 300, type: 'bar', toolbar: { show: false }, fontFamily: 'Nunito, sans-serif' },
    plotOptions: { bar: { horizontal: false, columnWidth: '50%', borderRadius: 5 } },
    colors: isDark ? ['#32a8a4'] : ['#1B55E2'],
    dataLabels: { enabled: false },
    xaxis: {
      categories: getWeekLabels(getWeekRange(currentDate).monday),
      labels: { style: { fontSize: '12px', cssClass: 'apexcharts-xaxis-title' } },
    },
    yaxis: {
      labels: {
        formatter: (val: number) => `Rs ${val.toLocaleString()}`,
        style: { fontSize: '12px', cssClass: 'apexcharts-yaxis-title' },
      },
      opposite: isRtl,
    },
    grid: { borderColor: isDark ? '#191E3A' : '#E0E6ED', strokeDashArray: 5 },
    tooltip: { y: { formatter: (val: number) => `Rs ${val.toLocaleString()}` } },
  };

  const StatCard = ({ title, value }: { title: string; value: string | number }) => (
    <div className={`panel p-4 shadow rounded text-center ${isDark ? 'bg-gray-800 text-white' : 'bg-white text-gray-800'}`}>
      <p className="text-sm font-medium">{title}</p>
      <h3 className="text-2xl font-bold mt-1">{value}</h3>
    </div>
  );

  const { monday, sunday } = getWeekRange(currentDate);

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-xl font-bold mb-4">Dashboard</h1>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard title="Total Users" value={stats.users} />
        <StatCard title="Total Concerts" value={stats.concerts} />
        <StatCard title="Bookings Made" value={stats.ticketsBooked} />
        <div className={`panel p-4 shadow rounded text-center ${isDark ? 'bg-gray-800 text-white' : 'bg-white text-gray-800'}`}>
          <p className="text-sm font-medium">Tickets Paid</p>
          <h3 className="text-2xl font-bold mt-1">{stats.ticketsPaid}</h3>
          <div className="mt-3 text-left text-sm max-h-48 overflow-y-auto">
            {ticketsPaidDetails.length === 0 ? (
              <p className="text-gray-400">No paid tickets</p>
            ) : (
              ticketsPaidDetails.map((concertGroup, idx) => (
                <div key={idx} className="mb-2 border-b border-gray-300 pb-1">
                  <p className="font-semibold">{concertGroup.concert}</p>
                  {concertGroup.tickets.map((ticket, tIdx) => (
                    <p key={tIdx} className="ml-2">- {ticket.ticketName}: {ticket.quantity}</p>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
        <StatCard title="Bookings Unpaid" value={stats.ticketsUnpaid} />
        <StatCard title="Revenue (MUR)" value={`Rs ${stats.revenue}`} />
      </div>

      <div className="mt-8">
        <div className={`panel p-4 shadow rounded ${isDark ? 'bg-gray-800 text-white' : 'bg-white text-gray-800'}`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Weekly Sales ({monday.toLocaleDateString()} - {sunday.toLocaleDateString()})</h2>
            <p className="text-lg font-bold">Total: Rs {totalSales.toLocaleString()}</p>
          </div>
          <div className="flex justify-end gap-2 mb-2">
            <button onClick={handlePrevWeek} className="px-3 py-1 text-sm border rounded dark:text-white dark:border-gray-600">← Previous</button>
            <button onClick={handleNextWeek} className="px-3 py-1 text-sm border rounded dark:text-white dark:border-gray-600">Next →</button>
          </div>
          <ReactApexChart
            key={salesData.join(',')}
            series={[{ name: 'Sales', data: salesData }]}
            options={options}
            type="bar"
            height={300}
          />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
