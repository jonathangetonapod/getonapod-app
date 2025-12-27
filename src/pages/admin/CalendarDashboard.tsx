import { useState } from 'react'
import { DashboardLayout } from '@/components/admin/DashboardLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Users, Calendar as CalendarIcon, CheckCircle2, Clock } from 'lucide-react'
import { Link } from 'react-router-dom'

// Mock data
const mockClients = [
  {
    id: '1',
    name: 'Client A',
    status: 'active' as const,
    months: [
      { month: 1, count: 3, booked: 2, inProgress: 1, recorded: 0, published: 0 },
      { month: 2, count: 2, booked: 1, inProgress: 0, recorded: 1, published: 0 },
      { month: 3, count: 4, booked: 3, inProgress: 1, recorded: 0, published: 0 },
      { month: 4, count: 1, booked: 1, inProgress: 0, recorded: 0, published: 0 },
      { month: 5, count: 3, booked: 2, inProgress: 1, recorded: 0, published: 0 },
      { month: 6, count: 2, booked: 1, inProgress: 0, recorded: 1, published: 0 },
      { month: 7, count: 0, booked: 0, inProgress: 0, recorded: 0, published: 0 },
      { month: 8, count: 1, booked: 0, inProgress: 1, recorded: 0, published: 0 },
      { month: 9, count: 2, booked: 2, inProgress: 0, recorded: 0, published: 0 },
      { month: 10, count: 1, booked: 1, inProgress: 0, recorded: 0, published: 0 },
      { month: 11, count: 0, booked: 0, inProgress: 0, recorded: 0, published: 0 },
      { month: 12, count: 0, booked: 0, inProgress: 0, recorded: 0, published: 0 },
    ]
  },
  {
    id: '2',
    name: 'Client B',
    status: 'active' as const,
    months: [
      { month: 1, count: 1, booked: 1, inProgress: 0, recorded: 0, published: 0 },
      { month: 2, count: 1, booked: 0, inProgress: 1, recorded: 0, published: 0 },
      { month: 3, count: 2, booked: 1, inProgress: 1, recorded: 0, published: 0 },
      { month: 4, count: 2, booked: 2, inProgress: 0, recorded: 0, published: 0 },
      { month: 5, count: 1, booked: 1, inProgress: 0, recorded: 0, published: 0 },
      { month: 6, count: 3, booked: 2, inProgress: 1, recorded: 0, published: 0 },
      { month: 7, count: 1, booked: 1, inProgress: 0, recorded: 0, published: 0 },
      { month: 8, count: 0, booked: 0, inProgress: 0, recorded: 0, published: 0 },
      { month: 9, count: 1, booked: 0, inProgress: 1, recorded: 0, published: 0 },
      { month: 10, count: 2, booked: 2, inProgress: 0, recorded: 0, published: 0 },
      { month: 11, count: 1, booked: 1, inProgress: 0, recorded: 0, published: 0 },
      { month: 12, count: 0, booked: 0, inProgress: 0, recorded: 0, published: 0 },
    ]
  },
  {
    id: '3',
    name: 'Client C',
    status: 'active' as const,
    months: [
      { month: 1, count: 2, booked: 1, inProgress: 1, recorded: 0, published: 0 },
      { month: 2, count: 3, booked: 2, inProgress: 1, recorded: 0, published: 0 },
      { month: 3, count: 1, booked: 1, inProgress: 0, recorded: 0, published: 0 },
      { month: 4, count: 2, booked: 1, inProgress: 1, recorded: 0, published: 0 },
      { month: 5, count: 2, booked: 2, inProgress: 0, recorded: 0, published: 0 },
      { month: 6, count: 1, booked: 0, inProgress: 1, recorded: 0, published: 0 },
      { month: 7, count: 2, booked: 2, inProgress: 0, recorded: 0, published: 0 },
      { month: 8, count: 1, booked: 1, inProgress: 0, recorded: 0, published: 0 },
      { month: 9, count: 0, booked: 0, inProgress: 0, recorded: 0, published: 0 },
      { month: 10, count: 1, booked: 0, inProgress: 1, recorded: 0, published: 0 },
      { month: 11, count: 2, booked: 2, inProgress: 0, recorded: 0, published: 0 },
      { month: 12, count: 1, booked: 1, inProgress: 0, recorded: 0, published: 0 },
    ]
  },
]

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function CalendarDashboard() {
  const [year, setYear] = useState('2025')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedMonth, setSelectedMonth] = useState<{ clientId: string; clientName: string; month: number } | null>(null)

  const filteredClients = mockClients.filter(client =>
    client.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const totalBooked = mockClients.reduce((sum, client) =>
    sum + client.months.reduce((s, m) => s + m.booked, 0), 0
  )

  const totalInProgress = mockClients.reduce((sum, client) =>
    sum + client.months.reduce((s, m) => s + m.inProgress, 0), 0
  )

  const handleMonthClick = (clientId: string, clientName: string, month: number, count: number) => {
    if (count > 0) {
      setSelectedMonth({ clientId, clientName, month })
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Podcast Calendar</h1>
          <p className="text-muted-foreground">Track client bookings and progress</p>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Clients</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{mockClients.length}</div>
              <p className="text-xs text-muted-foreground">Currently servicing</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">This Month</CardTitle>
              <CalendarIcon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {mockClients.reduce((sum, c) => sum + c.months[0].count, 0)}
              </div>
              <p className="text-xs text-muted-foreground">January bookings</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Booked</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalBooked}</div>
              <p className="text-xs text-muted-foreground">Confirmed bookings</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">In Progress</CardTitle>
              <Clock className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalInProgress}</div>
              <p className="text-xs text-muted-foreground">Being coordinated</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <CardTitle>Monthly Calendar</CardTitle>
              <div className="flex gap-4 w-full sm:w-auto">
                <Select value={year} onValueChange={setYear}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue placeholder="Year" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2024">2024</SelectItem>
                    <SelectItem value="2025">2025</SelectItem>
                    <SelectItem value="2026">2026</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Search clients..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="max-w-xs"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[150px] sticky left-0 bg-background z-10">Client</TableHead>
                    {monthNames.map((month) => (
                      <TableHead key={month} className="text-center min-w-[80px]">
                        {month}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredClients.map((client) => (
                    <TableRow key={client.id}>
                      <TableCell className="font-medium sticky left-0 bg-background z-10">
                        <Link
                          to={`/admin/clients/${client.id}`}
                          className="hover:text-primary hover:underline"
                        >
                          {client.name}
                        </Link>
                      </TableCell>
                      {client.months.map((monthData) => (
                        <TableCell key={monthData.month} className="text-center">
                          {monthData.count > 0 ? (
                            <button
                              onClick={() => handleMonthClick(client.id, client.name, monthData.month, monthData.count)}
                              className="w-full hover:bg-muted rounded px-2 py-1 transition-colors"
                            >
                              <div className="text-lg font-semibold text-green-600">
                                {monthData.count}
                              </div>
                              <div className="flex gap-1 justify-center mt-1">
                                {monthData.booked > 0 && (
                                  <span className="inline-block w-2 h-2 rounded-full bg-green-500" title={`${monthData.booked} booked`} />
                                )}
                                {monthData.inProgress > 0 && (
                                  <span className="inline-block w-2 h-2 rounded-full bg-yellow-500" title={`${monthData.inProgress} in progress`} />
                                )}
                                {monthData.recorded > 0 && (
                                  <span className="inline-block w-2 h-2 rounded-full bg-blue-500" title={`${monthData.recorded} recorded`} />
                                )}
                                {monthData.published > 0 && (
                                  <span className="inline-block w-2 h-2 rounded-full bg-purple-500" title={`${monthData.published} published`} />
                                )}
                              </div>
                            </button>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-4 mt-6 pt-4 border-t">
              <div className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-full bg-green-500" />
                <span className="text-sm text-muted-foreground">Booked</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-full bg-yellow-500" />
                <span className="text-sm text-muted-foreground">In Progress</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-full bg-blue-500" />
                <span className="text-sm text-muted-foreground">Recorded</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-full bg-purple-500" />
                <span className="text-sm text-muted-foreground">Published</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Month Detail Modal */}
      <Dialog open={!!selectedMonth} onOpenChange={() => setSelectedMonth(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selectedMonth && `${selectedMonth.clientName} - ${monthNames[selectedMonth.month - 1]} ${year}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Bookings for this month will be listed here once connected to the database.
            </p>
            <div className="space-y-2">
              <div className="p-4 bg-muted rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Tech Talks Podcast</p>
                    <p className="text-sm text-muted-foreground">Jan 15, 2025</p>
                  </div>
                  <Badge className="bg-green-100 text-green-800">Booked</Badge>
                </div>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Marketing Masterclass</p>
                    <p className="text-sm text-muted-foreground">Jan 22, 2025</p>
                  </div>
                  <Badge className="bg-yellow-100 text-yellow-800">In Progress</Badge>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
