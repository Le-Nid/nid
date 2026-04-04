import React from 'react'
import { Result, Button } from 'antd'
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
      return (
        <Result
          status="error"
          title="Une erreur inattendue s'est produite"
          subTitle={this.state.error?.message}
          extra={
            <Button type="primary" onClick={this.handleReset}>
              Réessayer
            </Button>
          }
        />
      )
    }
    return this.props.children
  }
}
