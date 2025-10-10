const appData = {
    user: {
        name: "John Doe",
        email: "john.doe@example.com",
    },
    reports: {
        monthlySummary: {
            workedHours: 168.5,
            workedHoursComparison: "+12.5%",
            ticketsHours: 24.2,
            ticketsHoursComparison: "+3.8%",
            currentBalance: 8.5,
            currentBalanceComparison: "-2.0%",
        },
        dailyWorkHours: [0, 0, 0, 0, 0, 6, 0, 8.2, 7.5, 8, 7.3, 8.5, 0, 0, 8, 7.8, 8.1, 7.9, 8, 6.5, 7.2, 8.3, 7.7, 0, 0, 8, 7.5, 8, 6.2, 7.8],
        workVsTickets: {
            work: 168.5,
            tickets: 24.2
        },
        recentTickets: [
            { date: "Jun 5", id: "TK-1245", time: "45 min" },
            { date: "Jun 4", id: "TK-1241", time: "1h 15min" },
            { date: "Jun 3", id: "TK-1239", time: "30 min" },
            { date: "Jun 2", id: "TK-1238", time: "1h 30min" },
            { date: "Jun 1", id: "TK-1235", time: "1h 00min" },
        ]
    },
    dashboard: {
        weeklySummary: {
            labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            workHours: [8, 7.5, 8.2, 6.5, 8, 0, 0],
            ticketsTime: [1.2, 0.8, 1.5, 2, 1.3, 0, 0]
        }
    }
};