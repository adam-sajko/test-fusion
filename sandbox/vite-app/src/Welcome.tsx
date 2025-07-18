import {
  BadgeGroup,
  Button,
  Card,
  Monogram,
  PageLayout,
  Text,
} from '@sandbox/ui';
import { useState } from 'react';

const accent = '#646cff';
const accentLight = '#ededff';
const stack = ['Vite', 'React', 'Istanbul', 'Playwright'];

export function WelcomePage() {
  const [count, setCount] = useState(0);

  return (
    <PageLayout background="#f5f5ff" testID="welcome-page">
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <Monogram letter="V" color={accent} />
        <Text
          tag="h1"
          size="xxl"
          weight="bold"
          color="#1a1a2e"
          style={{ margin: '0 0 0.5rem' }}
        >
          Welcome to Vite App
        </Text>
        <Text
          tag="p"
          size="base"
          color="#6b7280"
          style={{ margin: '0 0 1.25rem' }}
        >
          A sandbox for test coverage integration
        </Text>
        <BadgeGroup items={stack} color={accent} background={accentLight} />
      </div>

      <Card title="Get Started">
        <div style={{ textAlign: 'center', margin: '1rem 0' }}>
          <Button
            onClick={() => setCount((c) => c + 1)}
            color={accent}
            testId="counter-button"
          >
            Count: {count}
          </Button>
        </div>
        <Text
          tag="p"
          size="sm"
          color="#6b7280"
          align="center"
          style={{ marginTop: 0, lineHeight: '1.6' }}
        >
          This app instruments source code with{' '}
          <Text tag="strong" color="#374151">
            babel-plugin-istanbul
          </Text>{' '}
          at build time. Playwright collects the{' '}
          <Text
            tag="code"
            size="xs"
            color={accent}
            style={{
              background: accentLight,
              padding: '0.125rem 0.375rem',
              borderRadius: '0.25rem',
            }}
          >
            __coverage__
          </Text>{' '}
          object after each test.
        </Text>
      </Card>
    </PageLayout>
  );
}
