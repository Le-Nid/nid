import React from 'react'
import { CircleX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import i18n from '../i18n'
import { createLogger } from '../utils/logger'

const logger = createLogger('error-boundary')

interface Props {
  children: React.ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logger.error('Uncaught React error', {
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    })
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      // Above the router and QueryClient: plain markup, i18n read directly (no hooks in a class)
      return (
        <div role="alert" className="flex min-h-svh flex-col items-center justify-center gap-3 bg-background p-6 text-center text-foreground">
          <CircleX className="size-12 text-destructive" aria-hidden="true" />
          <h1 className="text-2xl font-semibold">{i18n.t('errorBoundary.title')}</h1>
          {this.state.error?.message && <p className="max-w-prose text-muted-foreground">{this.state.error.message}</p>}
          <Button className="h-11 md:h-9" onClick={this.handleReset}>{i18n.t('errorBoundary.retry')}</Button>
        </div>
      )
    }
    return this.props.children
  }
}
