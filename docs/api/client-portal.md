# Client Portal Documentation

## Overview

The Client Portal is a comprehensive client-facing interface where Get On A Pod (GOAP) clients can manage their podcast appearances, track their outreach campaigns, access educational resources, and purchase additional services. It serves as the central hub for clients to monitor their podcast guest journey from initial booking to published episodes.

## Authentication System

### Authentication Methods

The client portal supports two authentication methods:

#### 1. Magic Link Authentication (Passwordless)
- **Process**: Clients request a magic link via email
- **Expiry**: Magic links expire after 15 minutes
- **Usage**: One-time use only (links become invalid after first use)
- **Implementation**: Uses token-based authentication with secure session creation

#### 2. Password Authentication
- **Process**: Traditional email/password login
- **Security**: Encrypted password storage with secure session management
- **Fallback**: Available when magic link is not preferred

### Session Management

```typescript
interface ClientPortalSession {
  session_token: string
  client_id: string
  expires_at: string // 24-hour session validity
  created_at: string
}
```

**Features:**
- **Auto-refresh**: Sessions automatically refresh before expiry
- **Secure storage**: Session data stored in localStorage with encryption
- **Expiration handling**: Automatic logout when sessions expire
- **Validation**: Server-side session validation on each request

### Admin Impersonation

Administrators can impersonate clients to:
- View the portal from the client's perspective
- Debug issues and provide support
- Test features without affecting client data
- **Security**: Clear visual indicators when in impersonation mode

## Portal Structure & Navigation

### Layout Components

#### PortalLayout
- **Header**: Contains logo, client profile dropdown, and logout functionality
- **Navigation**: Tab-based navigation between Dashboard and Resources
- **Footer**: Contact information and branding
- **Responsive**: Mobile-friendly design with collapsible elements

#### Navigation Items
1. **Dashboard** - Main overview and management interface
2. **Resources** - Educational content and best practices

### User Profile Management
- **Avatar display**: Shows client photo or initials
- **Profile dropdown**: Quick access to account info and logout
- **Client information**: Name, email, and account details

## Dashboard Features

The Dashboard is the main interface where clients manage their podcast activities. It's organized into multiple sections and views:

### Core Dashboard Sections

#### 1. Overview Statistics
- **Total bookings** - Complete count of all podcast appearances
- **Published episodes** - Successfully published appearances
- **Upcoming recordings** - Scheduled recording sessions
- **Total audience reach** - Aggregate listener statistics
- **Average podcast rating** - Mean iTunes/rating across all appearances

#### 2. Booking Management

**Booking Status Workflow:**
```
conversation_started → in_progress → booked → recorded → published
```

**Status Indicators:**
- 🟡 **Conversation Started**: Initial contact established
- 🟠 **In Progress**: Actively coordinating details
- 🟢 **Booked**: Confirmed appointment scheduled  
- 🔵 **Recorded**: Episode has been recorded
- 🟣 **Published**: Episode is live and available

**Booking Information Tracked:**
- Podcast name and host details
- Audience size and iTunes rating
- Scheduled, recording, and publish dates
- Episode URLs when available
- Podcast artwork and descriptions

#### 3. Premium Placements

**Features:**
- Browse curated podcast opportunities
- Filter by category, audience size, and price range
- Add podcasts to cart for purchase
- View detailed podcast analytics and demographics

**Filtering Options:**
- **Categories**: Technology, Business, Health, etc.
- **Audience Tiers**: Small (0-25K), Medium (25K-50K), Large (50K-100K), Mega (100K+)
- **Price Ranges**: Under $1K, $1K-$2.5K, $2.5K-$5K, $5K-$10K, $10K+
- **Search**: By podcast name, description, or category

#### 4. Outreach Campaign Management

**Google Sheets Integration:**
- Connects to client's custom Google Sheet
- Displays targeted podcasts from outreach campaigns
- Shows podcast fit analysis and recommendations
- Tracks outreach messages sent to the GOAP team

**Outreach Features:**
- **AI-powered fit analysis**: Analyzes how well client matches each podcast
- **Demographic insights**: Audience data via PodScan integration
- **Campaign tracking**: Monitors outreach message status and responses
- **Podcast management**: Add/remove podcasts from outreach lists

#### 5. Activity Timeline

**Tracks all client activities:**
- Booking confirmations and status changes
- Episode publications and recordings
- Outreach message submissions
- Addon service purchases
- Important milestones and achievements

**Timeline Features:**
- Real-time activity feed
- Chronological ordering with timestamps
- Contextual details for each activity
- Integration with booking and outreach data

#### 6. Calendar View

**Monthly calendar displaying:**
- Scheduled recording dates
- Episode publish dates
- Booking confirmation dates
- Color-coded by status and activity type

**Calendar Features:**
- Navigate between months
- Click dates to view daily details
- Visual indicators for different event types
- Quick overview of upcoming commitments

#### 7. Action Items & Next Steps

**Automated task generation:**
- **Recording Prep**: Reminders for upcoming recordings
- **Episode Sharing**: Prompts to promote published episodes  
- **Follow-ups**: Track episodes needing publish date updates
- **Scheduling**: Bookings requiring recording date coordination

**Task Management:**
- Mark action items as complete
- Urgency indicators for time-sensitive items
- Smart recommendations based on booking status
- Integrated with booking lifecycle

### Analytics & Reporting

#### Time-Based Filtering
- Last 7, 14, 30, 60, 90 days
- All-time view for comprehensive analysis
- Dynamic chart updates based on time range

#### Performance Metrics
- **Booking trends**: Track booking velocity over time
- **Publication rates**: Monitor successful episode completion
- **Audience growth**: Cumulative reach expansion
- **Rating analysis**: Track podcast quality metrics

#### Data Visualization
- **Charts**: Bar, line, and pie charts for various metrics
- **Status distribution**: Visual breakdown of booking statuses
- **Audience reach**: Graphical representation of listener growth
- **Monthly trends**: Publication and booking patterns

#### Export Capabilities
- **CSV Export**: Download booking data for external analysis
- **Custom date ranges**: Export specific time periods
- **Comprehensive data**: All booking details and metrics

## Addon Services

### Service Management

**Available Services:**
- **Short-form Video Clips**: Convert podcast episodes into social media clips
- **Blog Post Creation**: SEO-optimized blog posts from episode content
- **Complete Bundles**: Comprehensive content packages
- **Custom Services**: Tailored offerings based on client needs

**Service Features:**
- **Pricing**: Transparent pricing for each service
- **Delivery timeframes**: Clear expectations for completion
- **Feature lists**: Detailed descriptions of what's included
- **Portfolio examples**: Sample work and case studies

### Shopping Cart Integration

**Cart Functionality:**
- Add multiple services across different episodes
- Episode-specific service purchases
- Bundle discounts and special offers
- Secure checkout process

**Purchase Management:**
- **Order tracking**: Monitor service progress
- **Delivery notifications**: Updates when work is complete
- **File delivery**: Direct download links for completed work
- **Revision requests**: Support for modifications

### Service Status Tracking

**Status Workflow:**
```
pending → in_progress → delivered → completed
```

**Status Details:**
- 🟡 **Pending**: Payment confirmed, work queued
- 🔵 **In Progress**: Actively being worked on
- 🟢 **Delivered**: Work completed and delivered
- ✅ **Completed**: Client satisfied and approved

## Resources Section

### Educational Content Management

**Content Categories:**
- **Preparation**: Pre-interview preparation guides
- **Technical Setup**: Audio/video setup instructions
- **Best Practices**: Industry tips and recommendations
- **Promotion**: Post-episode marketing strategies
- **Examples**: Sample interviews and case studies
- **Templates**: Ready-to-use documents and scripts

**Content Types:**
- **Articles**: In-depth written guides
- **Videos**: Tutorial and educational videos
- **Downloads**: PDF guides and templates
- **External Links**: Curated third-party resources

### Resource Features

**Content Management:**
- **Search functionality**: Find resources by keyword
- **Category filtering**: Browse by topic area
- **Featured content**: Highlighted important resources
- **View tracking**: Monitor which resources are accessed

**Display Options:**
- **Grid view**: Visual card layout for browsing
- **List view**: Compact linear layout for scanning
- **Detail modals**: Full-screen content viewing
- **External linking**: Direct access to downloads and videos

## Data Integration

### External Service Connections

#### Google Sheets Integration
- **Purpose**: Client outreach campaign management
- **Data Flow**: Podcast lists, contact information, outreach status
- **Real-time Sync**: Live updates from client's outreach activities

#### PodScan Integration  
- **Purpose**: Podcast demographic and analytics data
- **Data Provided**: Audience insights, geographic data, listening patterns
- **Usage**: Help clients understand target podcast audiences

#### Supabase Backend
- **Database**: PostgreSQL for all client and booking data
- **Authentication**: Secure user management and session handling
- **Real-time Updates**: Live data synchronization across portal

### AI-Powered Features

#### Podcast Fit Analysis
- **Function**: Analyzes alignment between client profile and target podcasts
- **Input**: Client bio, expertise, target audience
- **Output**: Compatibility scoring and recommendations
- **Caching**: Intelligent caching to improve performance

#### Content Recommendations
- **Personalization**: Tailored resource suggestions based on client activity
- **Machine Learning**: Improved recommendations over time
- **Context Awareness**: Suggestions based on current booking status

## Technical Architecture

### Frontend Technology Stack
- **React 18**: Modern component-based architecture
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Utility-first styling
- **Shadcn/ui**: Consistent component library
- **React Router**: Client-side navigation
- **React Query**: Server state management

### State Management
- **React Context**: Global authentication and user state
- **React Query**: Server data caching and synchronization
- **Zustand**: Client-side cart and UI state management
- **Local Storage**: Persistent session and preference storage

### Performance Optimizations
- **Code Splitting**: Lazy loading for faster initial load
- **Image Optimization**: Responsive images with lazy loading
- **Query Caching**: Intelligent data caching strategies
- **Bundle Optimization**: Minimized JavaScript bundles

### Security Measures
- **Token-based Authentication**: Secure session management
- **CSRF Protection**: Cross-site request forgery prevention
- **Input Validation**: Client and server-side validation
- **Secure Headers**: Protection against common vulnerabilities

## API Integration

### Client Portal API Endpoints

#### Authentication
```typescript
// Magic link authentication
POST /api/client-portal/magic-link
POST /api/client-portal/verify-token

// Password authentication  
POST /api/client-portal/login
POST /api/client-portal/logout

// Session management
GET /api/client-portal/validate-session
```

#### Data Retrieval
```typescript
// Client bookings and activities
GET /api/client-portal/bookings/:clientId

// Outreach campaigns
GET /api/client-portal/outreach/:clientId

// Premium podcasts
GET /api/client-portal/premium-podcasts

// Educational resources
GET /api/client-portal/resources
```

#### Service Management
```typescript
// Addon services
GET /api/client-portal/addon-services
POST /api/client-portal/purchase-addon

// Order tracking
GET /api/client-portal/orders/:clientId
PUT /api/client-portal/orders/:orderId/status
```

### Data Models

#### Client Model
```typescript
interface Client {
  id: string
  name: string
  email: string
  bio?: string
  photo_url?: string
  google_sheet_url?: string
  created_at: string
  updated_at: string
}
```

#### Booking Model
```typescript
interface Booking {
  id: string
  client_id: string
  podcast_name: string
  host_name?: string
  podcast_description?: string
  audience_size?: number
  itunes_rating?: number
  scheduled_date?: string
  recording_date?: string
  publish_date?: string
  episode_url?: string
  status: BookingStatus
  podcast_image_url?: string
  created_at: string
  updated_at: string
}
```

## Error Handling & Support

### Error Management
- **Graceful degradation**: Fallbacks when services are unavailable
- **User-friendly messages**: Clear error communication
- **Retry mechanisms**: Automatic retry for transient failures
- **Logging**: Comprehensive error tracking and monitoring

### Support Features
- **Contact information**: Easy access to support team
- **Help documentation**: Contextual help and guides
- **Feedback collection**: User experience improvement tracking
- **Issue reporting**: Direct communication channels for problems

### Monitoring & Analytics
- **Usage tracking**: Portal engagement and feature utilization
- **Performance monitoring**: Page load times and user experience
- **Error tracking**: Real-time error detection and resolution
- **Business metrics**: Client success and satisfaction measurement

## Mobile Responsiveness

### Responsive Design
- **Mobile-first approach**: Optimized for mobile devices
- **Tablet compatibility**: Intermediate screen size support
- **Desktop enhancement**: Full feature utilization on larger screens
- **Touch interactions**: Mobile-optimized user interactions

### Performance on Mobile
- **Optimized images**: Responsive image loading
- **Minimal JavaScript**: Reduced bundle size for mobile
- **Offline capabilities**: Basic functionality without internet
- **Fast loading**: Optimized for mobile network conditions

## Future Enhancements

### Planned Features
- **Push notifications**: Real-time updates and reminders
- **Advanced analytics**: More detailed reporting and insights
- **Integration expansion**: Additional third-party service connections
- **Collaboration tools**: Multi-user account support

### Scalability Considerations
- **Database optimization**: Performance improvements for growing data
- **Caching strategies**: Enhanced data caching for better performance
- **API rate limiting**: Protection against abuse and overuse
- **Infrastructure scaling**: Support for increasing user base

---

This documentation provides a comprehensive overview of the Client Portal's features, technical implementation, and usage patterns. The portal serves as a complete solution for podcast guest management, combining booking tracking, outreach management, educational resources, and additional services in a unified, user-friendly interface.