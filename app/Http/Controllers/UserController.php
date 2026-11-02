<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Support\Facades\Hash;

class UserController extends Controller
{
    private function isSuperOrAdmin(?User $user): bool
    {
        return (bool) ($user && $user->hasRole('Admin'));
    }

    private function authorizeUserAction(Request $request, array|string $permissions): void
    {
        $user = $request->user();
        if (!$user) {
            abort(401);
        }

        if ($this->isSuperOrAdmin($user) || $user->can('user.manage')) {
            return;
        }

        foreach ((array) $permissions as $perm) {
            if ($user->can($perm)) {
                return;
            }
        }

        abort(403, 'This action is unauthorized.');
    }

    private function assertCanTouchAdminRoleOrUser(Request $request, ?User $targetUser = null, array $requestedRoles = []): void
    {
        if ($this->isSuperOrAdmin($request->user())) {
            return;
        }

        if ($targetUser && ($this->isSuperOrAdmin($targetUser) || $targetUser->hasRole(['admin', 'super-admin']))) {
            abort(403, 'Non-admin users cannot modify or delete an Administrator account.');
        }

        foreach ($requestedRoles as $roleName) {
            if (in_array(strtolower(trim((string) $roleName)), ['admin', 'super-admin'], true)) {
                abort(403, 'Non-admin users cannot assign the Admin role.');
            }
        }
    }

    private function assertCanGrantPermissions(Request $request, array $requestedPermissions): void
    {
        $actor = $request->user();
        if ($this->isSuperOrAdmin($actor)) {
            return;
        }

        foreach ($requestedPermissions as $permName) {
            if (!$actor || !$actor->can((string) $permName)) {
                abort(403, "You cannot grant the '{$permName}' permission because you do not possess it.");
            }
        }
    }

    private function assertCanAssignRoles(Request $request, array $requestedRoles): void
    {
        $actor = $request->user();
        if ($this->isSuperOrAdmin($actor) || empty($requestedRoles)) {
            return;
        }

        $roles = \Spatie\Permission\Models\Role::with('permissions:id,name')
            ->whereIn('name', $requestedRoles)
            ->get();

        $rolePermissions = $roles
            ->flatMap(fn ($r) => $r->permissions->pluck('name'))
            ->unique()
            ->values()
            ->all();

        $this->assertCanGrantPermissions($request, $rolePermissions);
    }

    private function hasLinkedTransactions(User $user): bool
    {
        $db = \Illuminate\Support\Facades\DB::class;
        $schema = \Illuminate\Support\Facades\Schema::class;

        if ($schema::hasTable('sale_invoices') && $db::table('sale_invoices')->where('user_id', $user->id)->exists()) {
            return true;
        }
        if ($schema::hasTable('sale_returns') && $db::table('sale_returns')->where('user_id', $user->id)->exists()) {
            return true;
        }
        if ($schema::hasTable('cash_drawer_sessions') && $db::table('cash_drawer_sessions')->where('user_id', $user->id)->exists()) {
            return true;
        }

        return false;
    }

    private function isLastActiveAdmin(User $user): bool
    {
        if (!$this->isSuperOrAdmin($user)) {
            return false;
        }

        $otherActiveAdmins = User::query()
            ->where('id', '!=', $user->id)
            ->where('status', 'active')
            ->whereHas('roles', fn($q) => $q->where('name', 'Admin'))
            ->count();

        return $otherActiveAdmins === 0;
    }

    public function index(Request $request)
    {
        $this->authorizeUserAction($request, ['user.view']);

        $search  = trim($request->query('search', ''));
        $perPage = (int) $request->query('per_page', 15);
        $perPage = $perPage > 0 && $perPage <= 200 ? $perPage : 15;

        $q = User::query()
            ->with(['roles:id,name', 'permissions:id,name'])
            ->when($search, function ($qq) use ($search) {
                $like = '%'.$search.'%';
                $qq->where(function ($w) use ($like) {
                    $w->where('name', 'like', $like)
                      ->orWhere('email', 'like', $like);
                });
            })
            ->orderBy('id', 'desc');

        $users = $q->paginate($perPage);

        return response()->json([
            'data' => $users->items(),
            'meta' => [
                'current_page' => $users->currentPage(),
                'per_page'     => $users->perPage(),
                'total'        => $users->total(),
                'last_page'    => $users->lastPage(),
            ],
        ]);
    }

    public function store(Request $request)
    {
        $this->authorizeUserAction($request, ['user.create']);

        $data = $request->validate([
            'name'          => ['required','string','max:255'],
            'email'         => ['required','email','max:255','unique:users,email'],
            'password'      => ['required','string','min:6'],
            'status'        => ['nullable', Rule::in(['active','inactive'])],
            'roles'         => ['array'],
            'roles.*'       => ['string','exists:roles,name'],
            'permissions'   => ['array'],
            'permissions.*' => ['string','exists:permissions,name'],
        ]);

        if (!empty($data['roles'])) {
            $this->authorizeUserAction($request, ['user.assign.roles', 'user.create']);
        }
        if (!empty($data['permissions'])) {
            $this->authorizeUserAction($request, ['user.assign.permissions', 'user.create']);
        }

        $this->assertCanTouchAdminRoleOrUser($request, null, $data['roles'] ?? []);
        $this->assertCanAssignRoles($request, $data['roles'] ?? []);
        $this->assertCanGrantPermissions($request, $data['permissions'] ?? []);

        $user = new User();
        $user->name   = $data['name'];
        $user->email  = $data['email'];
        $user->status = $data['status'] ?? 'active';
        $user->password = Hash::make($data['password']);
        $user->save();

        if (!empty($data['roles']))        $user->syncRoles($data['roles']);
        if (!empty($data['permissions']))  $user->syncPermissions($data['permissions']);

        return response()->json($user->load('roles:id,name','permissions:id,name'), 201);
    }

    public function show(Request $request, User $user)
    {
        $this->authorizeUserAction($request, ['user.view']);
        return response()->json($user->load('roles:id,name','permissions:id,name'));
    }

    public function update(Request $request, User $user)
    {
        $this->authorizeUserAction($request, ['user.update']);

        $data = $request->validate([
            'name'          => ['required','string','max:255'],
            'email'         => ['required','email','max:255', Rule::unique('users','email')->ignore($user->id)],
            'password'      => ['nullable','string','min:6'],
            'status'        => ['nullable', Rule::in(['active','inactive'])],
            'roles'         => ['sometimes','array'],
            'roles.*'       => ['string','exists:roles,name'],
            'permissions'   => ['sometimes','array'],
            'permissions.*' => ['string','exists:permissions,name'],
        ]);

        if (array_key_exists('roles', $data)) {
            $this->authorizeUserAction($request, ['user.assign.roles', 'user.update']);
        }
        if (array_key_exists('permissions', $data)) {
            $this->authorizeUserAction($request, ['user.assign.permissions', 'user.update']);
        }

        $this->assertCanTouchAdminRoleOrUser($request, $user, $data['roles'] ?? []);
        if (array_key_exists('roles', $data)) {
            $this->assertCanAssignRoles($request, $data['roles'] ?? []);
        }
        if (array_key_exists('permissions', $data)) {
            $this->assertCanGrantPermissions($request, $data['permissions'] ?? []);
        }

        // Prevent self-deactivation
        if ($request->user()->id === $user->id && isset($data['status']) && $data['status'] !== 'active') {
            return response()->json(['message' => 'You cannot deactivate your own account.'], 422);
        }

        // Prevent deactivating or demoting the last active Admin (or self-demotion from Admin)
        if ($this->isSuperOrAdmin($user)) {
            $willBeInactive = isset($data['status']) && $data['status'] !== 'active';
            $willLoseAdminRole = array_key_exists('roles', $data) && !in_array('Admin', $data['roles'] ?? [], true);

            if ($willLoseAdminRole && $request->user()->id === $user->id) {
                return response()->json(['message' => 'You cannot remove the Admin role from your own account.'], 422);
            }

            if (($willBeInactive || $willLoseAdminRole) && $this->isLastActiveAdmin($user)) {
                return response()->json(['message' => 'Cannot deactivate or remove the Admin role from the last active Admin account.'], 422);
            }
        }

        $user->name  = $data['name'];
        $user->email = $data['email'];
        if (isset($data['status'])) $user->status = $data['status'];
        if (!empty($data['password'])) $user->password = Hash::make($data['password']);
        $user->save();

        if (($user->status ?? 'active') !== 'active') {
            $user->tokens()->delete();
        }

        if (array_key_exists('roles', $data))        $user->syncRoles($data['roles'] ?? []);
        if (array_key_exists('permissions', $data))  $user->syncPermissions($data['permissions'] ?? []);

        return response()->json($user->load('roles:id,name','permissions:id,name'));
    }

    public function destroy(User $user, Request $request)
    {
        $this->authorizeUserAction($request, ['user.delete']);
        $this->assertCanTouchAdminRoleOrUser($request, $user);

        if ($request->user()->id === $user->id) {
            return response()->json(['message' => 'You cannot delete your own account.'], 422);
        }

        if ($this->isLastActiveAdmin($user)) {
            return response()->json(['message' => 'Cannot delete the last active Admin account.'], 422);
        }

        if ($this->hasLinkedTransactions($user)) {
            return response()->json([
                'message' => 'Cannot delete user with existing sales, returns, or cash drawer history. Please deactivate the account instead.',
            ], 422);
        }

        $user->tokens()->delete();
        $user->delete();
        return response()->json(['message' => 'Deleted']);
    }

    // Optional: explicit endpoints if you prefer separate sync calls:
    public function syncRoles(Request $request, User $user)
    {
        $this->authorizeUserAction($request, ['user.assign.roles', 'user.update']);

        $data = $request->validate([
            'roles' => ['array'],
            'roles.*' => ['string','exists:roles,name'],
        ]);
        $this->assertCanTouchAdminRoleOrUser($request, $user, $data['roles'] ?? []);
        $this->assertCanAssignRoles($request, $data['roles'] ?? []);

        if ($this->isSuperOrAdmin($user) && !in_array('Admin', $data['roles'] ?? [], true)) {
            if ($request->user()->id === $user->id) {
                return response()->json(['message' => 'You cannot remove the Admin role from your own account.'], 422);
            }
            if ($this->isLastActiveAdmin($user)) {
                return response()->json(['message' => 'Cannot remove the Admin role from the last active Admin account.'], 422);
            }
        }

        $user->syncRoles($data['roles'] ?? []);
        return $user->load('roles:id,name','permissions:id,name');
    }

    public function syncPermissions(Request $request, User $user)
    {
        $this->authorizeUserAction($request, ['user.assign.permissions', 'user.update']);
        $this->assertCanTouchAdminRoleOrUser($request, $user);

        $data = $request->validate([
            'permissions' => ['array'],
            'permissions.*' => ['string','exists:permissions,name'],
        ]);

        $this->assertCanGrantPermissions($request, $data['permissions'] ?? []);

        $user->syncPermissions($data['permissions'] ?? []);
        return $user->load('roles:id,name','permissions:id,name');
    }

    public function bulkAction(Request $request)
    {
        $data = $request->validate([
            'action'     => ['required', Rule::in(['activate', 'deactivate', 'assign_role', 'delete'])],
            'user_ids'   => ['required', 'array', 'min:1'],
            'user_ids.*' => ['integer', 'exists:users,id'],
            'role'       => ['required_if:action,assign_role', 'nullable', 'string', 'exists:roles,name'],
        ]);

        $action  = $data['action'];
        $userIds = array_values(array_unique(array_map('intval', $data['user_ids'])));
        $actorId = (int) $request->user()->id;

        if ($action === 'delete') {
            $this->authorizeUserAction($request, ['user.delete']);
        } elseif ($action === 'assign_role') {
            $this->authorizeUserAction($request, ['user.assign.roles', 'user.update']);
            $this->assertCanTouchAdminRoleOrUser($request, null, [$data['role']]);
            $this->assertCanAssignRoles($request, [(string) $data['role']]);
        } else {
            $this->authorizeUserAction($request, ['user.update']);
        }

        $targets = User::with('roles:id,name')->whereIn('id', $userIds)->get();
        $processed = 0;
        $skipped = [];

        foreach ($targets as $target) {
            if (in_array($action, ['deactivate', 'delete'], true) && (int) $target->id === $actorId) {
                $skipped[] = "{$target->name} (cannot {$action} your own account)";
                continue;
            }

            if (!$this->isSuperOrAdmin($request->user()) && ($this->isSuperOrAdmin($target) || $target->hasRole(['admin', 'super-admin']))) {
                $skipped[] = "{$target->name} (admin account protected)";
                continue;
            }

            if (in_array($action, ['deactivate', 'delete'], true) && $this->isLastActiveAdmin($target)) {
                $skipped[] = "{$target->name} (last active Admin)";
                continue;
            }

            if ($action === 'activate') {
                $target->status = 'active';
                $target->save();
                $processed++;
            } elseif ($action === 'deactivate') {
                $target->status = 'inactive';
                $target->save();
                if (\Illuminate\Support\Facades\Schema::hasTable('personal_access_tokens')) {
                    $target->tokens()->delete();
                }
                $processed++;
            } elseif ($action === 'assign_role') {
                $roleName = (string) $data['role'];
                if ($this->isSuperOrAdmin($target) && $roleName !== 'Admin' && ($target->id === $actorId || $this->isLastActiveAdmin($target))) {
                    $skipped[] = "{$target->name} (cannot remove Admin role)";
                    continue;
                }
                $target->syncRoles([$roleName]);
                $processed++;
            } elseif ($action === 'delete') {
                if ($this->hasLinkedTransactions($target)) {
                    $skipped[] = "{$target->name} (has transaction history; deactivate instead)";
                    continue;
                }
                if (\Illuminate\Support\Facades\Schema::hasTable('personal_access_tokens')) {
                    $target->tokens()->delete();
                }
                $target->delete();
                $processed++;
            }
        }

        return response()->json([
            'message'   => "Processed {$processed} user(s)" . (count($skipped) ? '. Skipped: ' . implode(', ', $skipped) : '.'),
            'processed' => $processed,
            'skipped'   => $skipped,
        ]);
    }
}
