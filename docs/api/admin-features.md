# GOAP Admin Panel - Complete Feature Documentation

## Overview

The GOAP (Get On A Podcast) Admin Panel is a comprehensive internal management system for GOAP staff to manage clients, bookings, outreach campaigns, and all operational aspects of the podcast placement business.

## Table of Contents

1. [Admin Authentication & Authorization](#admin-authentication--authorization)
2. [Dashboard Overview](#dashboard-overview)
3. [Client Management](#client-management)
4. [Podcast & Booking Management](#podcast--booking-management)
5. [Lead & Outreach Management](#lead--outreach-management)
6. [Content Management](#content-management)
7. [Analytics & Reporting](#analytics--reporting)
8. [Add-on Services & Orders](#add-on-services--orders)
9. [AI-Powered Tools](#ai-powered-tools)
10. [Settings & Configuration](#settings--configuration)
11. [API Endpoints](#api-endpoints)

---

## Admin Authentication & Authorization

### Authentication Methods
- **Google OAuth**: Primary authentication method with Google SSO
- **Email/Password**: Fallback authentication for admin accounts
- **Session Management**: Persistent sessions with auto-refresh

### Authorization System
- **Admin Email Whitelist**: Database-driven admin email authorization
- **Fallback Admin**: Emergency access via `jonathan@getonapod.com`
- **Admin User Management**: Add/remove admin access for team members
- **Real-time Authorization**: Email verification on every login attempt

### Security Features
- **Email Validation**: Only whitelisted emails can access admin panel
- **Session Verification**: Continuous session validation
- **Protected Routes**: All admin routes require valid authentication
- **Automatic Logout**: Invalid users are automatically signed out

**Key Files:**
- `/src/contexts/AuthContext.tsx`
- `/src/lib/config.ts` 
- `/src/services/adminUsers.ts`
- `/src/pages/admin/Login.tsx`

---

## Dashboard Overview

### Main Dashboard (`/admin/dashboard`)

The central command center displaying real-time business metrics and requiring immediate attention.

#### Key Statistics
- **Active Clients**: Currently serviced clients
- **Monthly Pipeline**: This month's booking progress with completion rates
- **Booking Status Breakdown**: In Progress, Booked, Recorded, Published counts
- **Add-on Service Revenue**: Total revenue from additional services

#### Alerts & Attention Needed
- **Missing Dates**: Bookings without scheduled/recording/publish dates
- **Prep Not Sent**: Upcoming recordings without preparation materials
- **Action Required Items**: Visual alerts for items needing staff intervention

#### Live Activity Feeds
- **Recent Activity**: Latest booking updates and outreach messages
- **Upcoming Recordings**: Next 30 days of scheduled recordings
- **Going Live Soon**: Upcoming podcast publications
- **Recent Orders**: Latest add-on service purchases

#### Time-based Views
- **Configurable Time Ranges**: 7d, 14d, 30d, 60d, 90d views
- **Month Navigation**: Browse historical data by month
- **Real-time Updates**: Live data refresh without page reload

**Key Features:**
- Real-time pipeline tracking
- Attention alerts system
- Multi-timeframe analysis
- Activity monitoring

---

## Client Management

### Client Overview (`/admin/clients`)

#### Client Database
- **Complete Client Profiles**: Name, email, contact person, LinkedIn, website
- **Status Management**: Active, Paused, Churned status tracking
- **Portal Access Control**: Enable/disable client portal access per client
- **Client Notes**: Internal notes and client history

#### Multi-View Client Management

**1. All Clients View**
- Complete client list with lifetime stats
- Total bookings, status breakdowns, last booking dates
- Portal access status indicators
- Quick status updates

**2. Monthly View** 
- Clients filtered by specific month activity
- Month-by-month navigation
- Clients active in selected time period

**3. Analytics View**
- Client growth trends over time
- New client acquisition metrics
- Status distribution charts
- Retention analytics

#### Client Performance Metrics
- **Booking Statistics**: Total, Booked, In Progress, Recorded, Published
- **Completion Rates**: Track client success metrics
- **Activity Timeline**: Last booking dates and client engagement
- **Revenue Tracking**: Client-specific revenue analysis

#### Client Actions
- **Add New Clients**: Complete client profile creation
- **Edit Client Details**: Update contact information and status
- **Delete Clients**: Remove clients with confirmation
- **Bulk Operations**: Mass status updates and operations

**Key Features:**
- Comprehensive client database
- Multi-view management system
- Performance analytics
- Portal access management

---

## Podcast & Booking Management

### Calendar Dashboard (`/admin/calendar`)

#### Podcast Booking Pipeline
- **Booking Status Tracking**: Conversation Started → Booked → In Progress → Recorded → Published
- **Date Management**: Scheduled, Recording, and Publish date tracking
- **Host Information**: Podcast host names and contact details
- **Episode URLs**: Links to published episodes

#### Upcoming Events

**1. Upcoming Recordings (`/admin/upcoming`)**
- Recordings scheduled in configurable timeframes
- Prep status tracking (sent/not sent)
- Client and podcast details
- Alert system for missing prep materials

**2. Upcoming Going Live (`/admin/going-live`)**
- Podcasts scheduled for publication
- Publication date tracking
- Episode link management
- Client notification system

#### Client-Specific Podcast Management (`/admin/clients/{id}`)
- **Client Podcast Portfolio**: All bookings for specific client
- **Status Updates**: Quick booking status changes
- **Date Management**: Set/update all important dates
- **Prep Material Tracking**: Monitor preparation workflow
- **Episode Documentation**: Track episode links and metadata

### Podcast Database (`/admin/podcast-database`)
- **Podcast Discovery**: Search and categorize podcasts
- **Database Management**: Store podcast information and metadata
- **Host Contact Info**: Maintain host relationship data
- **Booking History**: Track past outreach and booking attempts

**Key Features:**
- Complete booking lifecycle management
- Multi-timeframe planning views
- Automated prep tracking
- Client-specific management

---

## Lead & Outreach Management

### Leads Dashboard (`/admin/leads`) - "Unibox"

#### Campaign Reply Management
- **Email Campaign Integration**: Sync with Email Bison and other platforms
- **Automated Reply Detection**: Smart categorization of incoming responses
- **Lead Classification**: Sales, Premium Placements, Client Podcast, Other

#### Lead Processing Workflow

**1. Auto-Sync System**
- **Real-time Sync**: 5-minute automatic sync intervals
- **Smart Sync**: Unread-only mode for efficiency
- **Rate Limiting**: Respects API rate limits
- **Background Processing**: Non-disruptive sync operations

**2. Lead Categorization**
- **Sales Leads**: Direct service inquiries
- **Premium Placement Leads**: High-value podcast placement opportunities  
- **Client Podcast Leads**: Potential client-owned podcasts
- **Unlabeled Leads**: Requiring manual classification

**3. Status Management**
- **New**: Unprocessed leads
- **Contacted**: Replied to by staff
- **Qualified**: High-potential leads
- **Not Interested**: Low-quality leads
- **Converted**: Successful conversions

#### Advanced Lead Features

**1. Swipe Card Interface**
- **Mobile-first Design**: Tinder-like swipe interface
- **Gesture Controls**: Swipe right (qualify), left (archive), up (reply), down (view thread)
- **Quick Actions**: Rapid lead processing
- **Keyboard Shortcuts**: Power user productivity features

**2. Email Thread Management**
- **Full Conversation View**: Complete email thread display
- **Reply Capability**: Direct email responses through Email Bison
- **Thread Context**: Maintain conversation history
- **Attachment Support**: Handle email attachments

**3. Filtering & Search**
- **Multi-criteria Filtering**: Status, type, date, read status
- **Quick Filters**: "Needs Reply", "Qualified", "Unread" shortcuts
- **Advanced Search**: Full-text search across all fields
- **Archive Management**: Hide/show archived leads

**Key Features:**
- Automated lead capture and sync
- Advanced categorization system
- Mobile-optimized swipe interface
- Full email integration

---

## Content Management

### Blog Management (`/admin/blog`)
- **Blog Post Creation**: Rich text editor with media support
- **Publication Management**: Draft, published, scheduled states
- **SEO Optimization**: Meta tags, descriptions, URL optimization
- **Category Management**: Organize content by topics

### Video Testimonials (`/admin/videos`)
- **Video Upload Management**: Client testimonial videos
- **Approval Workflow**: Review and approve client submissions
- **Display Control**: Choose which testimonials to showcase
- **Metadata Management**: Titles, descriptions, client attribution

### Guest Resources (`/admin/guest-resources`)
- **Resource Library**: Downloadable guides, templates, media kits
- **File Management**: Upload and organize resource files
- **Access Control**: Public vs client-only resources
- **Usage Analytics**: Track resource download metrics

**Key Features:**
- Multi-format content management
- Publication workflows
- SEO optimization tools
- Analytics integration

---

## Analytics & Reporting

### Premium Placement Analytics (`/admin/analytics`)
- **Revenue Tracking**: Premium placement service revenue
- **Conversion Metrics**: Lead to sale conversion rates
- **Performance Analytics**: Service delivery metrics
- **Client Satisfaction**: Feedback and rating analysis

### Global Analytics Dashboard
- **Business Metrics**: Overall business performance KPIs
- **Client Retention**: Churn analysis and retention rates
- **Revenue Trends**: Monthly/quarterly revenue analysis
- **Booking Pipeline**: Conversion funnel analysis

### Custom Reports
- **Date Range Selection**: Flexible time period analysis
- **Export Capabilities**: CSV and report generation
- **Comparison Views**: Period-over-period analysis
- **Drill-down Capability**: Detailed metric exploration

**Key Features:**
- Comprehensive business intelligence
- Real-time metric tracking
- Custom date range analysis
- Export functionality

---

## Add-on Services & Orders

### Order Management (`/admin/orders`)

#### Service Order Tracking
- **Complete Order History**: All add-on service purchases
- **Status Pipeline**: Pending → In Progress → Delivered → Cancelled
- **Revenue Tracking**: Individual and aggregate revenue metrics
- **Client Integration**: Orders linked to specific clients and podcasts

#### Order Processing Workflow
- **Quick Status Updates**: One-click status changes
- **Delivery Management**: Google Drive link integration
- **Admin Notes**: Internal order notes and communication
- **Payment Tracking**: Stripe payment intent integration

#### Service Types
- **Premium Services**: High-value add-on services
- **Content Creation**: Blog posts, social media, marketing materials
- **Additional Support**: Extended consulting and support services
- **Custom Requests**: Bespoke client requirements

#### Fulfillment Features
- **Delivery Tracking**: Track delivery dates and methods
- **File Management**: Google Drive integration for deliverables
- **Client Communication**: Automated delivery notifications
- **Quality Control**: Review and approval workflows

**Key Features:**
- Complete order lifecycle management
- Revenue tracking and reporting
- Integrated fulfillment system
- Client communication automation

---

## AI-Powered Tools

### AI Sales Director (`/admin/ai-sales-director`)
- **Intelligent Lead Scoring**: AI-powered lead qualification
- **Response Recommendations**: Suggested responses for common inquiries
- **Pipeline Optimization**: AI-driven pipeline management suggestions
- **Conversion Prediction**: Machine learning conversion probability

### Podcast Finder (`/admin/podcast-finder`)

#### AI-Powered Discovery
- **Smart Query Generation**: AI creates optimized search queries from client bios
- **Compatibility Scoring**: AI analyzes podcast-client fit (1-10 scale)
- **Automated Research**: Batch processing of podcast opportunities
- **Quality Filtering**: AI removes low-quality or irrelevant results

#### Advanced Search Capabilities
- **Multi-criteria Search**: Audience size, episode count, categories, regions
- **Chart Integration**: Apple Podcasts and Spotify chart data
- **Bulk Operations**: Process hundreds of podcasts simultaneously
- **Deduplication**: Intelligent duplicate removal

#### Prospect Management
- **New Prospect Mode**: Research for non-clients
- **Existing Client Mode**: Research for current clients
- **Google Sheets Export**: Automated prospect dashboard creation
- **Sharing System**: Client-facing prospect research dashboards

#### Compatibility Intelligence
- **Bio Analysis**: Deep analysis of client background and expertise
- **Audience Matching**: Match client expertise to podcast audience
- **Reasoning Engine**: Detailed explanations for compatibility scores
- **Batch Scoring**: Score hundreds of podcasts efficiently

**Key Features:**
- AI-generated search strategies
- Automated compatibility analysis
- Intelligent filtering and curation
- Prospect dashboard generation

---

## Settings & Configuration

### Admin User Management (`/admin/settings`)
- **Admin Email Whitelist**: Add/remove admin access
- **Role Management**: Different permission levels
- **Security Settings**: Authentication requirements
- **Access Logging**: Track admin user activity

### Global Cache Management
- **Cache Status Monitoring**: Real-time cache performance metrics
- **Cache Invalidation**: Force refresh of cached data
- **Performance Optimization**: Database query optimization
- **Error Monitoring**: Cache-related error tracking

### System Configuration
- **API Key Management**: Third-party service integration
- **Email Templates**: Automated communication templates
- **Notification Settings**: Admin alert preferences
- **Integration Settings**: CRM and tool integrations

**Key Features:**
- Centralized admin user management
- System performance monitoring
- Configuration management
- Security controls

---

## API Endpoints

### Core Admin APIs

#### Authentication
- `POST /api/auth/admin-login` - Admin authentication
- `GET /api/auth/admin-verify` - Verify admin session
- `POST /api/auth/admin-logout` - Admin logout

#### Client Management
- `GET /api/admin/clients` - List all clients
- `POST /api/admin/clients` - Create new client
- `GET /api/admin/clients/{id}` - Get client details
- `PUT /api/admin/clients/{id}` - Update client
- `DELETE /api/admin/clients/{id}` - Delete client
- `PUT /api/admin/clients/{id}/portal-access` - Toggle portal access

#### Booking Management
- `GET /api/admin/bookings` - List all bookings
- `POST /api/admin/bookings` - Create booking
- `PUT /api/admin/bookings/{id}` - Update booking
- `PUT /api/admin/bookings/{id}/status` - Update booking status
- `PUT /api/admin/bookings/{id}/dates` - Update booking dates

#### Lead Management
- `GET /api/admin/leads` - List campaign replies
- `POST /api/admin/leads/sync` - Sync with Email Bison
- `PUT /api/admin/leads/{id}` - Update lead classification
- `POST /api/admin/leads/{id}/reply` - Send lead response

#### Order Management
- `GET /api/admin/orders` - List all addon orders
- `PUT /api/admin/orders/{id}` - Update order status
- `DELETE /api/admin/orders/{id}` - Delete order

#### Analytics
- `GET /api/admin/analytics/dashboard` - Dashboard metrics
- `GET /api/admin/analytics/clients` - Client analytics
- `GET /api/admin/analytics/revenue` - Revenue analytics
- `GET /api/admin/analytics/bookings` - Booking pipeline analytics

#### AI Services
- `POST /api/admin/ai/generate-queries` - Generate podcast search queries
- `POST /api/admin/ai/score-compatibility` - Score podcast compatibility
- `POST /api/admin/ai/lead-scoring` - AI lead qualification

### External Integrations

#### Email Bison Integration
- `POST /functions/sync-replies` - Sync campaign replies
- `POST /functions/send-reply` - Send email through Bison
- `GET /functions/fetch-email-thread` - Get conversation thread

#### Google Sheets Integration
- `POST /api/admin/export/google-sheets` - Export podcast research
- `POST /api/admin/prospects/create-sheet` - Create prospect dashboard

#### Podscan API Integration
- `GET /api/admin/podcasts/search` - Search podcasts
- `GET /api/admin/podcasts/charts` - Get podcast charts
- `GET /api/admin/podcasts/{id}/demographics` - Podcast audience data

**Key Features:**
- RESTful API design
- Comprehensive CRUD operations
- Real-time data synchronization
- External service integration

---

## Security & Access Control

### Data Protection
- **Role-based Access Control**: Different admin permission levels
- **Audit Logging**: Track all admin actions and changes
- **Data Encryption**: Sensitive data encryption at rest and in transit
- **Secure Sessions**: Protected authentication sessions

### Operational Security
- **Admin Activity Monitoring**: Real-time admin action tracking
- **Access Restrictions**: IP-based and email-based access control
- **Emergency Access**: Fallback admin access for critical situations
- **Regular Security Audits**: Automated security scanning and monitoring

### Compliance
- **Data Privacy**: GDPR and privacy regulation compliance
- **Client Data Protection**: Secure handling of client information
- **Audit Trails**: Complete action history for compliance reporting

---

## Technical Architecture

### Frontend Technology Stack
- **React 18**: Modern React with hooks and context
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Utility-first styling
- **React Query**: Server state management
- **React Router**: Client-side routing

### Backend Integration
- **Supabase**: Backend as a service with PostgreSQL
- **Real-time Subscriptions**: Live data updates
- **Edge Functions**: Serverless backend logic
- **Row Level Security**: Database-level access control

### Third-party Integrations
- **Email Bison**: Email campaign management
- **Podscan API**: Podcast discovery and research
- **Google Sheets API**: Data export and prospect dashboards
- **Stripe**: Payment processing for add-on services

### Performance Features
- **Caching System**: Multi-level caching for performance
- **Lazy Loading**: Optimized component loading
- **Virtual Scrolling**: Handle large datasets efficiently
- **Background Sync**: Non-blocking data synchronization

---

## Conclusion

The GOAP Admin Panel represents a comprehensive business management system specifically designed for podcast placement operations. It combines traditional CRM functionality with AI-powered research tools, automated lead management, and sophisticated analytics to provide GOAP staff with everything needed to efficiently manage client relationships, discover podcast opportunities, and grow the business.

The system's modular architecture allows for easy expansion of features while maintaining security and performance standards required for a professional service business.

---

*This documentation covers the complete admin panel as of the current implementation. For technical implementation details, refer to the individual component files and service modules.*