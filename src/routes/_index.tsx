import type { Route } from './+types/_index'

export function loader() {
    return {}
}

export default function Index({
    loaderData,
    actionData,
}: Route.ComponentProps) {
    return (
        <div className='w-screen flex items-center justify-center'>hello </div>
    )
}
