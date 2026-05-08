import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/waterways/$waterwayId')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/waterways/$waterwayId"!</div>
}
